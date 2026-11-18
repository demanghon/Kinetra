import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import {
  buildBatteryAndChargeWidgetState,
  VocalCoachService,
  computeSynchronizedReplayFrame,
} from "./index.ts";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const FIXTURES_DIR = path.join(ROOT_DIR, "fixtures", "simulation");

describe("Ticket 08 — Mobile Client App: Live Battery/Charge Widget, Local Neural TTS Coach & 120Hz Synchronized Replay (REQ-API-002, REQ-API-003, REQ-API-004)", () => {
  it("Seam 1: renders live battery state, 50mA charging progress countdown, low-battery alert (<=15%), and ESP101 switch-off warning", () => {
    const chargingState = buildBatteryAndChargeWidgetState({
      battery_mv: 3780,
      battery_percent: 58.0,
      usb_vbus_connected: true,
      charging_state: "CHARGING_CC",
      charge_current_limit_ma: 50,
      estimated_minutes_to_full: 44,
      estimated_remaining_play_hours: null,
      wake_source: "USB_VBUS_PLUGGED",
      ble_on_demand_active: true,
    });
    assert.equal(chargingState.isCharging, true);
    assert.equal(chargingState.progressBarPercent, 58.0);
    assert.match(chargingState.statusLabelFr, /44 min/);
    assert.equal(chargingState.alertBannerFr, null);

    const switchWarning = buildBatteryAndChargeWidgetState({
      battery_mv: 4200,
      battery_percent: 100.0,
      usb_vbus_connected: true,
      charging_state: "SWITCH_OFF_DURING_CHARGE_WARNING",
      charge_current_limit_ma: 50,
      estimated_minutes_to_full: null,
      estimated_remaining_play_hours: null,
      wake_source: "USB_VBUS_PLUGGED",
      ble_on_demand_active: true,
    });
    assert.ok(switchWarning.alertBannerFr !== null);
    assert.match(switchWarning.alertBannerFr!, /interrupteur.*ON/i);

    const lowBattery = buildBatteryAndChargeWidgetState({
      battery_mv: 3180,
      battery_percent: 12.5,
      usb_vbus_connected: false,
      charging_state: "DISCHARGING",
      charge_current_limit_ma: 50,
      estimated_minutes_to_full: null,
      estimated_remaining_play_hours: 3.8,
      wake_source: "LSM6DS3_INT1_MOTION",
      ble_on_demand_active: true,
    });
    assert.equal(lowBattery.lowBatteryWarning, true);
    assert.match(lowBattery.alertBannerFr!, /Batterie faible/i);
  });

  it("Seam 2: VocalCoachService (Sherpa-ONNX Piper/Kokoro local TTS) announces automatic club switches and synthesizes actionable post-swing coaching tips", () => {
    const coach = new VocalCoachService({
      engine: "SHERPA_ONNX_LOCAL",
      voiceModel: "fr_FR-siwis-medium",
    });

    const manifest04 = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "04-single-face-on-toe-strike", "manifest.json"), "utf-8")
    );
    const imu04 = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "04-single-face-on-toe-strike", "imu_burst_1000hz.json"), "utf-8")
    );
    const bal04 = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "04-single-face-on-toe-strike", "expected_outcomes.json"), "utf-8")
    );

    // 1. Automatic club switch when sensor is clipped onto slot #4
    const switchCue = coach.onBleMountSlotChanged(4, [manifest04.club_profile]);
    assert.equal(switchCue.activeClub?.club_label, "7I");
    assert.match(switchCue.ttsUtteranceFr, /7I.*Ping.*G430/i);

    // 2. Post-swing coaching feedback on Toe Strike (-14mm)
    const swingTip = coach.generatePostSwingCoachingFeedback({
      imu: imu04,
      ballistics: bal04,
    });
    assert.match(swingTip.ttsUtteranceFr, /pointe/i);
    assert.match(swingTip.ttsUtteranceFr, /14/);
    assert.ok(swingTip.estimatedSynthesisLatencyMs < 80);
  });

  it("Seam 3: synchronizes video frame index, 120Hz Skia telemetry cursor, face strike map, and 3D ball coordinates within <= 1 frame around Impact Sync Anchor (t=0)", () => {
    const imu01 = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "01-driver-graphite-regular-tour-ball", "imu_burst_1000hz.json"), "utf-8")
    );
    const sync01 = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "01-driver-graphite-regular-tour-ball", "sync_audio_video.json"), "utf-8")
    );
    const bal01 = JSON.parse(
      fs.readFileSync(path.join(FIXTURES_DIR, "01-driver-graphite-regular-tour-ball", "expected_outcomes.json"), "utf-8")
    );

    const frameAtImpact = computeSynchronizedReplayFrame({
      scrubTimeRelMs: 0.0,
      videoAnchorFrameAtImuZero: 180,
      imu: imu01,
      sync: sync01,
      ballistics: bal01,
    });

    // At t_rel = 0.0ms with aligned_sync_offset_ms = 24.0ms @ 120 FPS (8.333ms/frame -> +2.88 frames -> frame 183)
    assert.ok(Math.abs(frameAtImpact.videoFrameIndex - 183) <= 1);
    assert.equal(frameAtImpact.faceStrikeMarker.strikeZone, "center");
    assert.equal(frameAtImpact.faceStrikeMarker.horizontalOffsetMm, -1.2);
    assert.equal(frameAtImpact.ballPosition3dM.x_m, 0.0);
  });
});
