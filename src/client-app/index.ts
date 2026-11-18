/**
 * `client-app` — Mobile Client Controllers & ViewModels (React Native JSI + Skia 120Hz +
 * On-Device Neural TTS `VocalCoachService` + Live Battery/Charge Widget + Synchronized 3D Replay)
 * (`REQ-API-002`, `REQ-API-003`, `REQ-API-004`, `ADR-0005`).
 */

import type { ClubProfilePayload } from "../bag-scanner/index.ts";

export interface PowerTelemetryPayload {
  battery_mv: number;
  battery_percent: number;
  usb_vbus_connected: boolean;
  charging_state:
    | "DISCHARGING"
    | "CHARGING_CC"
    | "CHARGING_CV"
    | "CHARGE_COMPLETE"
    | "SWITCH_OFF_DURING_CHARGE_WARNING";
  charge_current_limit_ma: number;
  estimated_minutes_to_full: number | null;
  estimated_remaining_play_hours: number | null;
  wake_source: "GPIOTE_MOUNT_INSERT" | "LSM6DS3_INT1_MOTION" | "USB_VBUS_PLUGGED";
  ble_on_demand_active: boolean;
}

export interface BatteryAndChargeWidgetState {
  batteryPercent: number;
  batteryMv: number;
  isCharging: boolean;
  chargeComplete: boolean;
  lowBatteryWarning: boolean;
  progressBarPercent: number;
  statusLabelFr: string;
  alertBannerFr: string | null;
}

/**
 * Builds the live battery & 50mA BQ25101 charging progress widget state (`REQ-API-003`).
 */
export function buildBatteryAndChargeWidgetState(
  telemetry: PowerTelemetryPayload
): BatteryAndChargeWidgetState {
  const isCharging =
    telemetry.charging_state === "CHARGING_CC" ||
    telemetry.charging_state === "CHARGING_CV";
  const chargeComplete = telemetry.charging_state === "CHARGE_COMPLETE";
  const lowBatteryWarning =
    !telemetry.usb_vbus_connected && telemetry.battery_percent <= 15.0;

  let statusLabelFr = `${telemetry.battery_percent.toFixed(0)}% (${telemetry.battery_mv} mV)`;
  let alertBannerFr: string | null = null;

  if (telemetry.charging_state === "SWITCH_OFF_DURING_CHARGE_WARNING") {
    statusLabelFr = "Charge bloquée (Interrupteur OFF)";
    alertBannerFr =
      "Attention : basculez l'interrupteur du capteur sur ON pour permettre la recharge de la batterie.";
  } else if (chargeComplete) {
    statusLabelFr = "Capteur GeoTrick chargé à 100 %";
  } else if (isCharging) {
    const phaseLabel =
      telemetry.charging_state === "CHARGING_CC"
        ? "Charge rapide 50 mA"
        : "Finition 4,2 V";
    const minStr =
      telemetry.estimated_minutes_to_full !== null
        ? ` — ${telemetry.estimated_minutes_to_full} min restantes`
        : "";
    statusLabelFr = `${phaseLabel} (${telemetry.battery_percent.toFixed(0)}%)${minStr}`;
  } else if (telemetry.estimated_remaining_play_hours !== null) {
    statusLabelFr = `${telemetry.battery_percent.toFixed(0)}% (~${telemetry.estimated_remaining_play_hours.toFixed(1)} h de jeu)`;
  }

  if (lowBatteryWarning) {
    alertBannerFr = `Batterie faible (${telemetry.battery_percent.toFixed(0)}%) — branchez le capteur en USB-C.`;
  }

  return {
    batteryPercent: telemetry.battery_percent,
    batteryMv: telemetry.battery_mv,
    isCharging,
    chargeComplete,
    lowBatteryWarning,
    progressBarPercent: telemetry.battery_percent,
    statusLabelFr,
    alertBannerFr,
  };
}

export interface VocalCoachOptions {
  engine: "SHERPA_ONNX_LOCAL";
  voiceModel: "fr_FR-siwis-medium" | "fr_FR-upmc-medium" | "kokoro-82m-ff_siwis";
}

export class VocalCoachService {
  public readonly engine: string;
  public readonly voiceModel: string;

  constructor(options: VocalCoachOptions) {
    this.engine = options.engine;
    this.voiceModel = options.voiceModel;
  }

  /**
   * Automatically selects the club when a 4-bit GPIO `mount_slot_id` change is received over BLE (`REQ-IMU-007`, `REQ-API-004`).
   */
  public onBleMountSlotChanged(
    mountSlotId: number,
    bagClubs: ClubProfilePayload[]
  ): {
    activeClub: ClubProfilePayload | null;
    ttsUtteranceFr: string;
    estimatedSynthesisLatencyMs: number;
  } {
    const found =
      bagClubs.find((c) => c.butt_cap_mount.mount_slot_id === mountSlotId) ??
      null;
    if (!found) {
      return {
        activeClub: null,
        ttsUtteranceFr: `Embase numéro ${mountSlotId} non associée. Voulez-vous scanner ce club ?`,
        estimatedSynthesisLatencyMs: 28,
      };
    }

    const matFr = found.shaft_material === "steel" ? "acier" : "graphite";
    return {
      activeClub: found,
      ttsUtteranceFr: `${found.club_label} ${found.brand} ${found.model}, manche ${matFr} ${found.flex_rating} sélectionné.`,
      estimatedSynthesisLatencyMs: 24,
    };
  }

  /**
   * Generates a natural French coaching tip after a swing for local neural TTS synthesis (`REQ-API-004`).
   */
  public generatePostSwingCoachingFeedback(input: {
    imu: {
      swing_event_classification: "ball_strike" | "dry_swing";
      impact_clipping_signature: {
        strike_zone: "toe" | "center" | "heel" | "none_dry_swing";
        estimated_horizontal_impact_mm: number;
      };
      compensated_clubhead_at_impact: {
        clubhead_speed_mps: number;
        compensated_face_angle_deg: number;
        club_path_deg: number;
        tempo_backswing_to_downswing_ratio: number;
      };
    };
    ballistics: {
      flight_summary: {
        active_ball_type: "tour_ball" | "range_ball";
        carry_distance_m: number;
        tour_ball_equivalent_carry_m: number;
      } | null;
    };
  }): { ttsUtteranceFr: string; estimatedSynthesisLatencyMs: number } {
    const { imu, ballistics } = input;
    const speedKmh = Math.round(
      imu.compensated_clubhead_at_impact.clubhead_speed_mps * 3.6
    );
    const faceDeg = imu.compensated_clubhead_at_impact.compensated_face_angle_deg;
    const zone = imu.impact_clipping_signature.strike_zone;
    const offsetMm = Math.abs(
      Math.round(imu.impact_clipping_signature.estimated_horizontal_impact_mm)
    );

    if (imu.swing_event_classification === "dry_swing") {
      return {
        ttsUtteranceFr: `Swing à vide à ${speedKmh} kilomètres heure, tempo ${imu.compensated_clubhead_at_impact.tempo_backswing_to_downswing_ratio.toFixed(1)} pour 1.`,
        estimatedSynthesisLatencyMs: 32,
      };
    }

    const carryText = ballistics.flight_summary
      ? ballistics.flight_summary.active_ball_type === "range_ball"
        ? `Portée ${ballistics.flight_summary.carry_distance_m.toFixed(0)} mètres en balle de practice, soit ${ballistics.flight_summary.tour_ball_equivalent_carry_m.toFixed(0)} mètres avec une balle de parcours.`
        : `Portée ${ballistics.flight_summary.carry_distance_m.toFixed(0)} mètres.`
      : "";

    if (zone === "toe") {
      return {
        ttsUtteranceFr: `${carryText} Impact décentré de ${offsetMm} millimètres en pointe avec une face ouverte de ${faceDeg.toFixed(1)} degrés. Gardez votre posture et vos bras plus proches du corps à la descente.`,
        estimatedSynthesisLatencyMs: 38,
      };
    }

    if (zone === "heel") {
      return {
        ttsUtteranceFr: `${carryText} Impact à ${offsetMm} millimètres au talon. Laissez un peu plus d'espace entre vos mains et vos cuisses à l'adresse.`,
        estimatedSynthesisLatencyMs: 36,
      };
    }

    return {
      ttsUtteranceFr: `Excellent contact plein centre à ${speedKmh} kilomètres heure ! ${carryText}`,
      estimatedSynthesisLatencyMs: 30,
    };
  }
}

export interface SynchronizedReplayFrameState {
  scrubTimeRelMs: number;
  videoFrameIndex: number;
  skiaCursorTimeMs: number;
  faceStrikeMarker: {
    strikeZone: string;
    horizontalOffsetMm: number;
    saturatedAt16g: boolean;
    axialTwistDps: number;
  };
  ballPosition3dM: { x_m: number; y_m: number; z_m: number };
}

/**
 * Synchronizes the video player frame index, 120Hz Skia telemetry cursor, and 3D Three.js scene
 * within <= 1 frame around the `Impact Sync Anchor` (`t = 0`) (`REQ-API-002`).
 */
export function computeSynchronizedReplayFrame(input: {
  scrubTimeRelMs: number;
  videoAnchorFrameAtImuZero: number;
  imu: {
    impact_clipping_signature: {
      strike_zone: string;
      estimated_horizontal_impact_mm: number;
      saturated_at_16g: boolean;
      axial_gyro_twist_impulse_dps: number;
    };
  };
  sync: {
    camera_streams: Array<{ fps: number }>;
    impact_sync_anchor: { aligned_sync_offset_ms: number };
  };
  ballistics: {
    trajectory_points_50hz: Array<{ t_s: number; x_m: number; y_m: number; z_m: number }>;
  };
}): SynchronizedReplayFrameState {
  const fps = input.sync.camera_streams[0]?.fps ?? 60;
  const videoRelTimeMs =
    input.scrubTimeRelMs + input.sync.impact_sync_anchor.aligned_sync_offset_ms;
  const frameDelta = Math.round((videoRelTimeMs / 1000.0) * fps);
  const videoFrameIndex = input.videoAnchorFrameAtImuZero + frameDelta;

  let ballPos = { x_m: 0.0, y_m: 0.0, z_m: 0.0 };
  if (input.scrubTimeRelMs > 0 && input.ballistics.trajectory_points_50hz.length > 0) {
    const tSec = input.scrubTimeRelMs / 1000.0;
    const nearest = input.ballistics.trajectory_points_50hz.reduce((prev, curr) =>
      Math.abs(curr.t_s - tSec) < Math.abs(prev.t_s - tSec) ? curr : prev
    );
    ballPos = { x_m: nearest.x_m, y_m: nearest.y_m, z_m: nearest.z_m };
  }

  return {
    scrubTimeRelMs: input.scrubTimeRelMs,
    videoFrameIndex,
    skiaCursorTimeMs: input.scrubTimeRelMs,
    faceStrikeMarker: {
      strikeZone: input.imu.impact_clipping_signature.strike_zone,
      horizontalOffsetMm:
        input.imu.impact_clipping_signature.estimated_horizontal_impact_mm,
      saturatedAt16g: input.imu.impact_clipping_signature.saturated_at_16g,
      axialTwistDps:
        input.imu.impact_clipping_signature.axial_gyro_twist_impulse_dps,
    },
    ballPosition3dM: ballPos,
  };
}
