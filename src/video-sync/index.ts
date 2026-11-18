/**
 * `video-sync` — Single-Smartphone Video Session (v1: DTL / Face-On), Spatial Calibration
 * Validator, and Millisecond `Impact Sync Anchor` Engine (`REQ-SYNC-001`..`006`).
 */

export type CameraRole = "dtl" | "face_on";

export interface SpatialCalibrationFrame {
  virtual_spirit_level_roll_deg: number;
  virtual_spirit_level_pitch_deg: number;
  camera_to_ball_distance_m: number;
  camera_height_m: number;
  ground_target_line_locked: boolean;
  calibration_valid: boolean;
}

export interface CameraStreamSpec {
  stream_id: string;
  role: CameraRole;
  fps: number;
  shutter_speed_inv_s: number;
  resolution: string;
}

export interface CalibrationValidationResult {
  valid: boolean;
  errorCode?: "ERR_CAMERA_TILT_OUT_OF_BOUNDS" | "ERR_SCHEMA_VALIDATION_FAILED";
  reason?: string;
}

export function validateSpatialCalibrationAndStreams(
  calibration: SpatialCalibrationFrame,
  streams: CameraStreamSpec[]
): CalibrationValidationResult {
  if (
    Math.abs(calibration.virtual_spirit_level_roll_deg) > 1.0 ||
    Math.abs(calibration.virtual_spirit_level_pitch_deg) > 3.0
  ) {
    return {
      valid: false,
      errorCode: "ERR_CAMERA_TILT_OUT_OF_BOUNDS",
      reason: `Camera spirit level out of bounds: roll=${calibration.virtual_spirit_level_roll_deg}°, pitch=${calibration.virtual_spirit_level_pitch_deg}°`,
    };
  }

  if (
    !calibration.ground_target_line_locked ||
    !calibration.calibration_valid ||
    calibration.camera_to_ball_distance_m < 1.5 ||
    calibration.camera_to_ball_distance_m > 4.5
  ) {
    return {
      valid: false,
      errorCode: "ERR_SCHEMA_VALIDATION_FAILED",
      reason: "Ground target line not locked or camera distance outside [1.5m, 4.5m]",
    };
  }

  if (streams.length < 1 || streams.length > 2) {
    return {
      valid: false,
      errorCode: "ERR_SCHEMA_VALIDATION_FAILED",
      reason: "camera_streams must contain 1 (v1) or 2 (v2) streams",
    };
  }

  for (const s of streams) {
    if (s.fps < 60 || s.shutter_speed_inv_s < 250) {
      return {
        valid: false,
        errorCode: "ERR_SCHEMA_VALIDATION_FAILED",
        reason: `Stream ${s.stream_id} fails minimum capture rate (fps>=60, shutter>=1/250s)`,
      };
    }
  }

  return { valid: true };
}

export interface ComputeImpactSyncAnchorInput {
  swingEventClassification: "ball_strike" | "dry_swing";
  cameraToBallDistanceM: number;
  ambientTemperatureC: number;
  imuImpactTimestampMs: number;
  audioPeakRawTimestampMs: number | null;
  visualLowPointTimestampMs?: number;
  opticalFlashDetected?: boolean;
  cameraFps: number;
}

export interface ImpactSyncAnchor {
  sync_method:
    | "ACOUSTIC_SHOCK_AND_16G_CLIPPING"
    | "OPTICAL_FLASH_AND_ACOUSTIC"
    | "DRY_SWING_LOW_POINT_CORRELATION";
  imu_impact_timestamp_ms: number;
  audio_peak_raw_timestamp_ms: number | null;
  acoustic_tof_correction_ms: number;
  aligned_sync_offset_ms: number;
  sync_uncertainty_ms: number;
}

/**
 * Aligns the 1000 Hz GeoTrick IMU timeline with the smartphone audio/video timeline (`REQ-SYNC-003`, `REQ-SYNC-004`).
 */
export function computeImpactSyncAnchor(
  input: ComputeImpactSyncAnchorInput
): ImpactSyncAnchor {
  if (
    input.swingEventClassification === "dry_swing" ||
    input.audioPeakRawTimestampMs === null
  ) {
    const visualLowPoint =
      input.visualLowPointTimestampMs ?? input.imuImpactTimestampMs + 18.0;
    const offsetMs =
      Math.round((visualLowPoint - input.imuImpactTimestampMs) * 100) / 100;
    return {
      sync_method: "DRY_SWING_LOW_POINT_CORRELATION",
      imu_impact_timestamp_ms: input.imuImpactTimestampMs,
      audio_peak_raw_timestamp_ms: null,
      acoustic_tof_correction_ms: 0.0,
      aligned_sync_offset_ms: offsetMs,
      sync_uncertainty_ms: Number((250.0 / input.cameraFps).toFixed(1)),
    };
  }

  // Speed of sound in air as a function of ambient temperature (m/s)
  const speedOfSoundMps = 331.3 + 0.606 * input.ambientTemperatureC;
  const rawTofMs = (input.cameraToBallDistanceM / speedOfSoundMps) * 1000.0;
  const acousticTofCorrectionMs = Math.round(rawTofMs * 100) / 100;

  const correctedVideoImpactMs =
    input.audioPeakRawTimestampMs - acousticTofCorrectionMs;
  const alignedSyncOffsetMs =
    Math.round((correctedVideoImpactMs - input.imuImpactTimestampMs) * 100) / 100;

  const syncUncertaintyMs = input.cameraFps >= 120 ? 0.8 : 1.1;

  return {
    sync_method: input.opticalFlashDetected
      ? "OPTICAL_FLASH_AND_ACOUSTIC"
      : "ACOUSTIC_SHOCK_AND_16G_CLIPPING",
    imu_impact_timestamp_ms: input.imuImpactTimestampMs,
    audio_peak_raw_timestamp_ms: input.audioPeakRawTimestampMs,
    acoustic_tof_correction_ms: acousticTofCorrectionMs,
    aligned_sync_offset_ms: alignedSyncOffsetMs,
    sync_uncertainty_ms: syncUncertaintyMs,
  };
}

export interface DtlLaunchWindow {
  tracked_frames_count: number;
  measured_vertical_launch_deg: number;
  measured_horizontal_launch_deg: number;
  measured_ball_speed_mps: number;
  launch_visibility_confidence: number;
}

export interface PoseKinematicsSummary {
  shoulder_turn_top_deg: number;
  hip_turn_top_deg: number;
  x_factor_top_deg: number;
  pelvis_lateral_sway_cm: number;
  swing_plane_angle_deg: number;
}

export interface BuildSynchronizedVideoSessionInput {
  sessionId: string;
  primaryCameraRole: CameraRole;
  spatialCalibrationFrame: SpatialCalibrationFrame;
  cameraStreams: CameraStreamSpec[];
  syncInput: ComputeImpactSyncAnchorInput;
  dtlLaunchWindow: DtlLaunchWindow | null;
  poseKinematicsSummary: PoseKinematicsSummary;
}

export interface VideoSyncSessionPayload {
  session_id: string;
  topology_version: "v1_single_smartphone" | "v2_dual_smartphone";
  primary_camera_role: CameraRole;
  spatial_calibration_frame: SpatialCalibrationFrame;
  camera_streams: CameraStreamSpec[];
  impact_sync_anchor: ImpactSyncAnchor;
  dtl_launch_window: DtlLaunchWindow | null;
  pose_kinematics_summary: PoseKinematicsSummary;
}

export function buildSynchronizedVideoSession(
  input: BuildSynchronizedVideoSessionInput
): VideoSyncSessionPayload {
  const check = validateSpatialCalibrationAndStreams(
    input.spatialCalibrationFrame,
    input.cameraStreams
  );
  if (!check.valid) {
    throw new Error(`${check.errorCode}: ${check.reason}`);
  }

  const impactSyncAnchor = computeImpactSyncAnchor(input.syncInput);
  const topologyVersion =
    input.cameraStreams.length === 1
      ? "v1_single_smartphone"
      : "v2_dual_smartphone";

  return {
    session_id: input.sessionId,
    topology_version: topologyVersion,
    primary_camera_role: input.primaryCameraRole,
    spatial_calibration_frame: input.spatialCalibrationFrame,
    camera_streams: input.cameraStreams,
    impact_sync_anchor: impactSyncAnchor,
    dtl_launch_window:
      input.primaryCameraRole === "dtl" &&
      input.syncInput.swingEventClassification === "ball_strike"
        ? input.dtlLaunchWindow
        : null,
    pose_kinematics_summary: input.poseKinematicsSummary,
  };
}
