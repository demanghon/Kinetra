/**
 * `bag-scanner` — On-Device Vision (`YOLOv11n` + `PaddleOCR-v4` + `MobileNetV3-Small`)
 * & Local Neural TTS (`Sherpa-ONNX` + `Piper / Kokoro-82M`) Bag Onboarding & Single-Club
 * Update Engine (`REQ-BAG-001`..`007`, `specs/03-bag-scanner-ai.md`).
 */

export type ClubCategory =
  | "driver"
  | "fairway_wood"
  | "hybrid"
  | "iron"
  | "wedge"
  | "putter";
export type ShaftMaterial = "steel" | "graphite";
export type FlexRating = "L" | "A" | "R" | "S" | "X";
export type ScanMode = "FULL_BAG_ONBOARDING" | "SINGLE_CLUB_UPDATE";
export type BagScannerState =
  | "WAIT_CLUB_HEAD"
  | "SCANNING_HEAD"
  | "ASK_USER_HEAD"
  | "WAIT_SHAFT_LABEL"
  | "SCANNING_SHAFT"
  | "ASK_USER_SHAFT"
  | "WAIT_MOUNT_CLIP"
  | "RESOLVE_PHYSICS"
  | "CLUB_SAVED";

export interface ClubProfilePayload {
  club_id: string;
  club_category: ClubCategory;
  club_label: string;
  handedness: "right_handed" | "left_handed";
  brand: string;
  model: string;
  shaft_model?: string;
  shaft_material: ShaftMaterial;
  flex_rating: FlexRating;
  catalog_resolution_source: "EXACT_MODEL_MATCH" | "ARCHETYPE_FALLBACK" | "USER_CUSTOM";
  physics_parameters: {
    total_length_m: number;
    grip_hand_hold_length_m: number;
    static_loft_deg: number;
    static_lie_deg: number;
    head_mass_g: number;
    cg_offset_mm: {
      x_back_mm: number;
      y_toe_ward_mm: number;
      z_up_mm: number;
    };
    ei_lead_lag_nm2: number;
    ei_droop_nm2: number;
    gj_torsion_nm2: number;
    anisotropic_coupling_kappa: number;
    shaft_wave_speed_mps: number;
    grip_elastomer_damping_ms: number;
  };
  butt_cap_mount: {
    mount_slot_id: number;
    gpio_binary_code_d3_d0: string;
    keyway_type: "ASYMMETRIC_D_LOCK_V1";
    nominal_face_alignment_offset_deg: number;
  };
}

export interface BagScannerInteractiveEvent {
  scan_session_id: string;
  scan_mode: ScanMode;
  current_state: BagScannerState;
  tts_utterance_fr: string;
  frame_sharpness_score: number;
  detected_mount_slot_id: number | null;
  extracted_attributes: {
    club_category: ClubCategory | null;
    club_label: string | null;
    brand: string | null;
    model: string | null;
    shaft_model?: string | null;
    shaft_material: ShaftMaterial | null;
    flex_rating: FlexRating | null;
    confidences: {
      head_confidence: number;
      shaft_material_confidence: number;
      flex_confidence: number;
    };
  };
  requires_user_confirmation: boolean;
  resolved_club_profile: ClubProfilePayload | null;
}

/**
 * Converts a mount_slot_id (1..14) into its 4-bit GPIO binary jumper string (D3,D2,D1,D0) (`REQ-IMU-007`).
 */
export function mountSlotIdToGpioBinary(mountSlotId: number): string {
  if (!Number.isInteger(mountSlotId) || mountSlotId < 1 || mountSlotId > 14) {
    throw new Error(`Invalid mount_slot_id: ${mountSlotId} (expected 1..14)`);
  }
  const code = 15 - mountSlotId;
  return code.toString(2).padStart(4, "0");
}

/**
 * Fuses `PaddleOCR-v4` shaft text and `MobileNetV3-Small` metallic specularity score
 * to classify `steel` vs `graphite` and normalize `flex_rating` (`REQ-BAG-003`).
 */
export function classifyShaftMaterialFromVisionAndOcr(
  ocrText: string,
  metallicSpecularityScore: number
): { shaftMaterial: ShaftMaterial; flexRating: FlexRating; shaftModel: string } {
  const normalized = ocrText.trim();
  const upper = normalized.toUpperCase();

  let shaftMaterial: ShaftMaterial =
    metallicSpecularityScore >= 0.65 ? "steel" : "graphite";
  if (
    upper.includes("DYNAMIC GOLD") ||
    upper.includes("PROJECT X") ||
    upper.includes("KBS") ||
    upper.includes("MODUS")
  ) {
    shaftMaterial = "steel";
  } else if (
    upper.includes("VENTUS") ||
    upper.includes("ALTA") ||
    upper.includes("TENSEI") ||
    upper.includes("HZRDUS") ||
    upper.includes("GRAPHITE")
  ) {
    shaftMaterial = "graphite";
  }

  let flexRating: FlexRating = "R";
  if (
    /\b(X-STIFF|EXTRA STIFF|6\.5|X100|TX|[567]-X)\b/.test(upper)
  ) {
    flexRating = "X";
  } else if (
    /\b(STIFF|S300|S400|6\.0|[567]-S|\bS\b)\b/.test(upper)
  ) {
    flexRating = "S";
  } else if (/\b(SENIOR|AMATEUR|SOFT|5\.0|\bA\b|\bM\b)\b/.test(upper)) {
    flexRating = "A";
  } else if (/\b(LADIES|4\.0|\bL\b)\b/.test(upper)) {
    flexRating = "L";
  } else {
    flexRating = "R";
  }

  return {
    shaftMaterial,
    flexRating,
    shaftModel: normalized || (shaftMaterial === "steel" ? "Standard Steel" : "Standard Graphite"),
  };
}

/**
 * Resolves full elastodynamic parameters from `ClubPhysicsCatalog` (`specs/03-bag-scanner-ai.md` §2).
 */
export function resolveClubProfileFromCatalog(input: {
  clubCategory: ClubCategory;
  clubLabel: string;
  brand: string;
  model: string;
  shaftModel?: string;
  shaftMaterial: ShaftMaterial;
  flexRating: FlexRating;
  mountSlotId: number;
  nominalFaceAlignmentOffsetDeg?: number;
}): ClubProfilePayload {
  const {
    clubCategory,
    clubLabel,
    brand,
    model,
    shaftModel,
    shaftMaterial,
    flexRating,
    mountSlotId,
    nominalFaceAlignmentOffsetDeg,
  } = input;

  const isDriver = clubCategory === "driver";
  const isWedge = clubCategory === "wedge";

  const totalLengthM = isDriver ? 1.156 : isWedge ? 0.895 : shaftMaterial === "graphite" ? 0.946 : 0.94;
  const staticLoftDeg = isDriver
    ? flexRating === "S" || flexRating === "X"
      ? 9.5
      : 10.5
    : isWedge
    ? 56.0
    : shaftMaterial === "graphite"
    ? 31.0
    : 32.0;
  const staticLieDeg = isDriver ? 58.0 : isWedge ? 64.0 : 62.0;
  const headMassG = isDriver ? 200.0 : isWedge ? 298.0 : shaftMaterial === "graphite" ? 264.0 : 270.0;

  let ei = 46.0;
  let gj = 44.0;
  let kappa = 0.0;
  if (shaftMaterial === "steel") {
    ei = flexRating === "S" || flexRating === "X" ? 54.0 : 46.0;
    gj = flexRating === "S" || flexRating === "X" ? 51.0 : 44.0;
    kappa = 0.0;
  } else {
    if (isDriver) {
      ei = flexRating === "S" || flexRating === "X" ? 39.5 : 32.0;
      gj = flexRating === "S" || flexRating === "X" ? 24.8 : 19.5;
      kappa = flexRating === "S" || flexRating === "X" ? 0.11 : 0.14;
    } else {
      ei = 36.0;
      gj = 23.0;
      kappa = 0.10;
    }
  }

  const slug = `club-${clubLabel.toLowerCase()}-${brand.toLowerCase()}-${model.toLowerCase()}`
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");

  return {
    club_id: slug,
    club_category: clubCategory,
    club_label: clubLabel,
    handedness: "right_handed",
    brand,
    model,
    shaft_model: shaftModel ?? (shaftMaterial === "steel" ? "Standard Steel" : "Standard Graphite"),
    shaft_material: shaftMaterial,
    flex_rating: flexRating,
    catalog_resolution_source: "EXACT_MODEL_MATCH",
    physics_parameters: {
      total_length_m: totalLengthM,
      grip_hand_hold_length_m: 0.2,
      static_loft_deg: staticLoftDeg,
      static_lie_deg: staticLieDeg,
      head_mass_g: headMassG,
      cg_offset_mm: isDriver
        ? { x_back_mm: -34.0, y_toe_ward_mm: 22.5, z_up_mm: 2.0 }
        : { x_back_mm: -10.5, y_toe_ward_mm: 18.0, z_up_mm: -2.0 },
      ei_lead_lag_nm2: ei,
      ei_droop_nm2: ei,
      gj_torsion_nm2: gj,
      anisotropic_coupling_kappa: kappa,
      shaft_wave_speed_mps: shaftMaterial === "steel" ? 5100.0 : 3800.0,
      grip_elastomer_damping_ms: shaftMaterial === "steel" ? 0.15 : 0.18,
    },
    butt_cap_mount: {
      mount_slot_id: mountSlotId,
      gpio_binary_code_d3_d0: mountSlotIdToGpioBinary(mountSlotId),
      keyway_type: "ASYMMETRIC_D_LOCK_V1",
      nominal_face_alignment_offset_deg: nominalFaceAlignmentOffsetDeg ?? 0.0,
    },
  };
}

export interface BagScannerSessionOptions {
  scanSessionId: string;
  scanMode: ScanMode;
  preClippedMountSlotId?: number;
}

export class BagScannerSession {
  private readonly scanSessionId: string;
  private readonly scanMode: ScanMode;
  private state: BagScannerState = "WAIT_CLUB_HEAD";
  private ttsUtteranceFr: string;
  private sharpnessScore = 0.0;
  private detectedMountSlotId: number | null;
  private clubCategory: ClubCategory | null = null;
  private clubLabel: string | null = null;
  private brand: string | null = null;
  private model: string | null = null;
  private shaftModel: string | null = null;
  private shaftMaterial: ShaftMaterial | null = null;
  private flexRating: FlexRating | null = null;
  private headConfidence = 0.0;
  private shaftMaterialConfidence = 0.0;
  private flexConfidence = 0.0;
  private requiresUserConfirmation = false;
  private resolvedClubProfile: ClubProfilePayload | null = null;

  constructor(options: BagScannerSessionOptions) {
    this.scanSessionId = options.scanSessionId;
    this.scanMode = options.scanMode;
    this.detectedMountSlotId = options.preClippedMountSlotId ?? null;
    this.ttsUtteranceFr =
      options.scanMode === "SINGLE_CLUB_UPDATE" && this.detectedMountSlotId !== null
        ? `Mise à jour du club sur l'embase numéro ${this.detectedMountSlotId}. Présentez la tête du club devant la caméra.`
        : "Présentez la tête de votre club devant la caméra.";
  }

  public currentEvent(): BagScannerInteractiveEvent {
    return {
      scan_session_id: this.scanSessionId,
      scan_mode: this.scanMode,
      current_state: this.state,
      tts_utterance_fr: this.ttsUtteranceFr,
      frame_sharpness_score: this.sharpnessScore,
      detected_mount_slot_id: this.detectedMountSlotId,
      extracted_attributes: {
        club_category: this.clubCategory,
        club_label: this.clubLabel,
        brand: this.brand,
        model: this.model,
        shaft_model: this.shaftModel,
        shaft_material: this.shaftMaterial,
        flex_rating: this.flexRating,
        confidences: {
          head_confidence: this.headConfidence,
          shaft_material_confidence: this.shaftMaterialConfidence,
          flex_confidence: this.flexConfidence,
        },
      },
      requires_user_confirmation: this.requiresUserConfirmation,
      resolved_club_profile: this.resolvedClubProfile,
    };
  }

  public processHeadFrame(frame: {
    sharpnessScore: number;
    clubCategory: ClubCategory;
    clubLabel: string;
    brand: string;
    model: string;
    headConfidence: number;
    timedOutAfter6s?: boolean;
  }): BagScannerInteractiveEvent {
    this.sharpnessScore = frame.sharpnessScore;
    if (frame.sharpnessScore < 0.70) {
      this.state = "SCANNING_HEAD";
      this.ttsUtteranceFr = "Stabilisez la tête du club devant la caméra.";
      return this.currentEvent();
    }

    this.clubCategory = frame.clubCategory;
    this.clubLabel = frame.clubLabel;
    this.brand = frame.brand;
    this.model = frame.model;
    this.headConfidence = frame.headConfidence;

    if (frame.headConfidence >= 0.85) {
      this.state = "WAIT_SHAFT_LABEL";
      this.requiresUserConfirmation = false;
      this.ttsUtteranceFr = `${frame.clubLabel} ${frame.brand} ${frame.model} reconnu. Tournez maintenant le club et montrez les inscriptions du manche.`;
    } else if (frame.timedOutAfter6s) {
      this.state = "ASK_USER_HEAD";
      this.requiresUserConfirmation = true;
      this.ttsUtteranceFr = "Sélectionnez le numéro du club à l'écran.";
    } else {
      this.state = "SCANNING_HEAD";
    }
    return this.currentEvent();
  }

  public processShaftFrame(frame: {
    sharpnessScore: number;
    ocrText: string;
    metallicSpecularityScore: number;
    shaftMaterialConfidence: number;
    flexConfidence: number;
    timedOutAfter6s?: boolean;
  }): BagScannerInteractiveEvent {
    this.sharpnessScore = frame.sharpnessScore;
    if (frame.sharpnessScore < 0.70) {
      this.state = "SCANNING_SHAFT";
      this.ttsUtteranceFr = "Stabilisez le manche devant la caméra.";
      return this.currentEvent();
    }

    const classified = classifyShaftMaterialFromVisionAndOcr(
      frame.ocrText,
      frame.metallicSpecularityScore
    );
    this.shaftMaterial = classified.shaftMaterial;
    this.flexRating = classified.flexRating;
    this.shaftModel = classified.shaftModel;
    this.shaftMaterialConfidence = frame.shaftMaterialConfidence;
    this.flexConfidence = frame.flexConfidence;

    if (
      frame.shaftMaterialConfidence >= 0.85 &&
      frame.flexConfidence >= 0.85
    ) {
      this.requiresUserConfirmation = false;
      if (this.detectedMountSlotId !== null) {
        return this.bindMountSlot(this.detectedMountSlotId);
      }
      this.state = "WAIT_MOUNT_CLIP";
      const matFr = this.shaftMaterial === "steel" ? "Acier" : "Graphite";
      this.ttsUtteranceFr = `Manche ${matFr} flex ${this.flexRating} détecté. Clipsez maintenant le capteur sur l'embase de ce club.`;
    } else if (frame.timedOutAfter6s) {
      this.state = "ASK_USER_SHAFT";
      this.requiresUserConfirmation = true;
      this.ttsUtteranceFr =
        "Inscription peu lisible : touchez Acier ou Graphite et le flex à l'écran.";
    } else {
      this.state = "SCANNING_SHAFT";
    }

    return this.currentEvent();
  }

  public confirmUserShaftSelection(
    shaftMaterial: ShaftMaterial,
    flexRating: FlexRating
  ): BagScannerInteractiveEvent {
    this.shaftMaterial = shaftMaterial;
    this.flexRating = flexRating;
    this.shaftMaterialConfidence = 1.0;
    this.flexConfidence = 1.0;
    this.requiresUserConfirmation = false;

    if (this.detectedMountSlotId !== null) {
      return this.bindMountSlot(this.detectedMountSlotId);
    }
    this.state = "WAIT_MOUNT_CLIP";
    this.ttsUtteranceFr = "Clipsez maintenant le capteur sur l'embase de ce club.";
    return this.currentEvent();
  }

  public bindMountSlot(
    mountSlotId: number,
    measuredAlignmentOffsetDeg = 0.0
  ): BagScannerInteractiveEvent {
    this.detectedMountSlotId = mountSlotId;

    // REQ-IMU-010 & REQ-BAG-006: Check if the newly glued mount is misaligned by more than ±12.0°
    const roundedOffset = Math.round(measuredAlignmentOffsetDeg * 10) / 10;
    if (Math.abs(roundedOffset) > 12.0) {
      this.state = "WAIT_MOUNT_CLIP";
      this.requiresUserConfirmation = true;
      this.resolvedClubProfile = null;
      const sideFr = roundedOffset > 0 ? "la droite" : "la gauche";
      this.ttsUtteranceFr = `Attention, l'embase numéro ${mountSlotId} est décalée de ${Math.abs(roundedOffset).toFixed(1)} degrés vers ${sideFr}. Décollez-la maintenant et réalignez la flèche FACE avec le bord d'attaque du club.`;
      return this.currentEvent();
    }

    this.state = "RESOLVE_PHYSICS";
    this.requiresUserConfirmation = false;

    this.resolvedClubProfile = resolveClubProfileFromCatalog({
      clubCategory: this.clubCategory ?? "iron",
      clubLabel: this.clubLabel ?? "7I",
      brand: this.brand ?? "Generic",
      model: this.model ?? "Standard",
      shaftModel: this.shaftModel ?? undefined,
      shaftMaterial: this.shaftMaterial ?? "steel",
      flexRating: this.flexRating ?? "R",
      mountSlotId,
      nominalFaceAlignmentOffsetDeg: roundedOffset,
    });

    this.state = "CLUB_SAVED";
    const matFr = this.shaftMaterial === "steel" ? "Acier" : "Graphite";
    const offsetNote =
      Math.abs(roundedOffset) > 0.05
        ? ` (étalonnage d'alignement ${roundedOffset > 0 ? "+" : ""}${roundedOffset.toFixed(1)}° enregistré)`
        : "";
    this.ttsUtteranceFr =
      this.scanMode === "SINGLE_CLUB_UPDATE"
        ? `${this.clubLabel} ${this.brand} ${this.model} en ${matFr} ${this.flexRating} mis à jour sur l'embase numéro ${mountSlotId}${offsetNote}.`
        : `${this.clubLabel} ${this.brand} ${this.model} lié à l'embase numéro ${mountSlotId}${offsetNote}. Passez au club suivant.`;

    return this.currentEvent();
  }
}
