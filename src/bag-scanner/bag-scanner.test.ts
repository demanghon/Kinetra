import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  BagScannerSession,
  classifyShaftMaterialFromVisionAndOcr,
  resolveClubProfileFromCatalog,
} from "./index.ts";
import { SchemaRegistry } from "../sim-harness/index.ts";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const SCHEMAS_DIR = path.join(ROOT_DIR, "schemas");

describe("Ticket 07 — On-Device Vision & Local Neural TTS Bag Scanner + Single-Club Update (REQ-BAG-001..007)", () => {
  it("Seam 1: ignores blurry video frames (<0.70 sharpness), drives TTS state transitions, and binds 4-bit GPIO mount_slot_id", () => {
    const registry = SchemaRegistry.fromDirectory(SCHEMAS_DIR);
    const scanner = new BagScannerSession({
      scanSessionId: "scan-bag-01",
      scanMode: "FULL_BAG_ONBOARDING",
    });

    // Initial state: WAIT_CLUB_HEAD
    let evt = scanner.currentEvent();
    assert.equal(evt.current_state, "WAIT_CLUB_HEAD");
    assert.match(evt.tts_utterance_fr, /Présentez la tête/i);

    // 1. Feed blurry frame (sharpness 0.45 < 0.70) -> stays in WAIT_CLUB_HEAD / SCANNING_HEAD without accepting OCR
    evt = scanner.processHeadFrame({
      sharpnessScore: 0.45,
      clubCategory: "iron",
      clubLabel: "7I",
      brand: "Titleist",
      model: "T100",
      headConfidence: 0.92,
    });
    assert.equal(evt.current_state, "SCANNING_HEAD");

    // 2. Feed sharp frame (sharpness 0.84 >= 0.70, confidence 0.94 >= 0.85) -> advances to WAIT_SHAFT_LABEL
    evt = scanner.processHeadFrame({
      sharpnessScore: 0.84,
      clubCategory: "iron",
      clubLabel: "7I",
      brand: "Titleist",
      model: "T100",
      headConfidence: 0.94,
    });
    assert.equal(evt.current_state, "WAIT_SHAFT_LABEL");
    assert.match(evt.tts_utterance_fr, /7I|Titleist|manche/i);

    // 3. Feed shaft frame (PaddleOCR + MobileNetV3 specularity -> steel Stiff, confidence >= 0.85) -> advances to WAIT_MOUNT_CLIP
    evt = scanner.processShaftFrame({
      sharpnessScore: 0.88,
      ocrText: "True Temper Dynamic Gold S300",
      metallicSpecularityScore: 0.91,
      shaftMaterialConfidence: 0.95,
      flexConfidence: 0.92,
    });
    assert.equal(evt.current_state, "WAIT_MOUNT_CLIP");
    assert.equal(evt.extracted_attributes.shaft_material, "steel");
    assert.equal(evt.extracted_attributes.flex_rating, "S");
    assert.match(evt.tts_utterance_fr, /Clipsez maintenant le capteur/i);

    // 4. Clip GeoTrick sensor onto mount slot #7 -> resolves physics and saves ClubProfile
    evt = scanner.bindMountSlot(7);
    assert.equal(evt.current_state, "CLUB_SAVED");
    assert.equal(evt.detected_mount_slot_id, 7);
    assert.ok(evt.resolved_club_profile !== null);
    assert.equal(evt.resolved_club_profile?.butt_cap_mount.mount_slot_id, 7);
    assert.equal(evt.resolved_club_profile?.butt_cap_mount.gpio_binary_code_d3_d0, "1000");

    const validation = registry.validate(
      "https://kinetra.golf/schemas/bag-scanner.schema.json",
      evt
    );
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  });

  it("Seam 2: supports SINGLE_CLUB_UPDATE mode to replace a single club on an already-clipped mount slot without rescanning the bag, and triggers 1-tap fallback when confidence < 0.85", () => {
    const bagMap = new Map<number, unknown>();
    bagMap.set(1, { club_id: "old-driver", model: "Old Driver" });
    bagMap.set(7, { club_id: "iron-7", model: "T100" });

    // Start SINGLE_CLUB_UPDATE with sensor already clipped on slot #1
    const singleUpdater = new BagScannerSession({
      scanSessionId: "scan-update-slot1",
      scanMode: "SINGLE_CLUB_UPDATE",
      preClippedMountSlotId: 1,
    });

    singleUpdater.processHeadFrame({
      sharpnessScore: 0.90,
      clubCategory: "driver",
      clubLabel: "1W",
      brand: "TaylorMade",
      model: "Qi10",
      headConfidence: 0.96,
    });

    // Simulate worn shaft label (confidence 0.55 < 0.85 after 6s timeout) -> ASK_USER_SHAFT
    let evt = singleUpdater.processShaftFrame({
      sharpnessScore: 0.82,
      ocrText: "",
      metallicSpecularityScore: 0.20,
      shaftMaterialConfidence: 0.60,
      flexConfidence: 0.50,
      timedOutAfter6s: true,
    });
    assert.equal(evt.current_state, "ASK_USER_SHAFT");
    assert.equal(evt.requires_user_confirmation, true);

    // User taps [Graphite] + [R] on screen -> since slot #1 was pre-clipped, resolves directly to CLUB_SAVED!
    evt = singleUpdater.confirmUserShaftSelection("graphite", "R");
    assert.equal(evt.current_state, "CLUB_SAVED");
    assert.equal(evt.resolved_club_profile?.butt_cap_mount.mount_slot_id, 1);
    assert.equal(evt.resolved_club_profile?.physics_parameters.ei_lead_lag_nm2, 32.0);
    assert.equal(evt.resolved_club_profile?.physics_parameters.gj_torsion_nm2, 19.5);

    // Update slot #1 in bag while keeping slot #7 untouched
    bagMap.set(1, evt.resolved_club_profile);
    assert.equal(bagMap.size, 2);
    assert.equal((bagMap.get(7) as { club_id: string }).club_id, "iron-7");
  });
});
