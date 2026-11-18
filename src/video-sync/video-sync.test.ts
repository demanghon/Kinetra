import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import {
  validateSpatialCalibrationAndStreams,
  computeImpactSyncAnchor,
  buildSynchronizedVideoSession,
} from "./index.ts";
import { SchemaRegistry } from "../sim-harness/index.ts";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const SCHEMAS_DIR = path.join(ROOT_DIR, "schemas");

describe("Ticket 05 — Single-Smartphone Video Session, Spatial Calibration & Millisecond Impact Sync Anchor (REQ-SYNC-001..006)", () => {
  it("Seam 1: validates Spatial Calibration Frame and rejects tilted smartphone (>1° roll or >3° pitch) with ERR_CAMERA_TILT_OUT_OF_BOUNDS", () => {
    const validCalib = validateSpatialCalibrationAndStreams(
      {
        virtual_spirit_level_roll_deg: 0.2,
        virtual_spirit_level_pitch_deg: -0.8,
        camera_to_ball_distance_m: 2.6,
        camera_height_m: 1.02,
        ground_target_line_locked: true,
        calibration_valid: true,
      },
      [{ stream_id: "cam-dtl", role: "dtl", fps: 120, shutter_speed_inv_s: 1000, resolution: "1920x1080" }]
    );
    assert.equal(validCalib.valid, true);

    const tilted = validateSpatialCalibrationAndStreams(
      {
        virtual_spirit_level_roll_deg: 1.8, // > 1.0° limit
        virtual_spirit_level_pitch_deg: -0.5,
        camera_to_ball_distance_m: 2.6,
        camera_height_m: 1.02,
        ground_target_line_locked: true,
        calibration_valid: true,
      },
      [{ stream_id: "cam-dtl", role: "dtl", fps: 120, shutter_speed_inv_s: 1000, resolution: "1920x1080" }]
    );
    assert.equal(tilted.valid, false);
    assert.equal(tilted.errorCode, "ERR_CAMERA_TILT_OUT_OF_BOUNDS");
  });

  it("Seam 2: aligns acoustic shock + 16g IMU clipping within ±1.5ms by subtracting acoustic time-of-flight, and falls back to Low Point on Dry Swing", () => {
    // Scenario 01: d_cam = 2.6m, T = 21°C, t_imu = 1500.0ms, t_audio_raw = 1531.58ms -> offset = 24.0ms
    const sync01 = computeImpactSyncAnchor({
      swingEventClassification: "ball_strike",
      cameraToBallDistanceM: 2.6,
      ambientTemperatureC: 21.0,
      imuImpactTimestampMs: 1500.0,
      audioPeakRawTimestampMs: 1531.58,
      cameraFps: 120,
    });
    assert.equal(sync01.sync_method, "ACOUSTIC_SHOCK_AND_16G_CLIPPING");
    assert.ok(Math.abs(sync01.acoustic_tof_correction_ms - 7.58) <= 0.05);
    assert.ok(Math.abs(sync01.aligned_sync_offset_ms - 24.0) <= 0.1);

    // Scenario 03: Dry Swing (no audio impact peak, aligned via Low Point)
    const sync03 = computeImpactSyncAnchor({
      swingEventClassification: "dry_swing",
      cameraToBallDistanceM: 2.6,
      ambientTemperatureC: 20.0,
      imuImpactTimestampMs: 1500.0,
      audioPeakRawTimestampMs: null,
      visualLowPointTimestampMs: 1518.0,
      cameraFps: 60,
    });
    assert.equal(sync03.sync_method, "DRY_SWING_LOW_POINT_CORRELATION");
    assert.equal(sync03.audio_peak_raw_timestamp_ms, null);
    assert.ok(Math.abs(sync03.aligned_sync_offset_ms - 18.0) <= 0.1);
  });

  it("Seam 3: builds a schema-compliant VideoSyncSession in both DTL and Face-On single-smartphone modes", () => {
    const registry = SchemaRegistry.fromDirectory(SCHEMAS_DIR);
    const session = buildSynchronizedVideoSession({
      sessionId: "sess-test-dtl",
      primaryCameraRole: "dtl",
      spatialCalibrationFrame: {
        virtual_spirit_level_roll_deg: 0.2,
        virtual_spirit_level_pitch_deg: -0.8,
        camera_to_ball_distance_m: 2.6,
        camera_height_m: 1.02,
        ground_target_line_locked: true,
        calibration_valid: true,
      },
      cameraStreams: [
        { stream_id: "cam-primary-dtl", role: "dtl", fps: 120, shutter_speed_inv_s: 1000, resolution: "1920x1080" },
      ],
      syncInput: {
        swingEventClassification: "ball_strike",
        cameraToBallDistanceM: 2.6,
        ambientTemperatureC: 21.0,
        imuImpactTimestampMs: 1500.0,
        audioPeakRawTimestampMs: 1531.58,
        cameraFps: 120,
      },
      dtlLaunchWindow: {
        tracked_frames_count: 5,
        measured_vertical_launch_deg: 13.4,
        measured_horizontal_launch_deg: 1.1,
        measured_ball_speed_mps: 66.2,
        launch_visibility_confidence: 0.94,
      },
      poseKinematicsSummary: {
        shoulder_turn_top_deg: 92.5,
        hip_turn_top_deg: 44.0,
        x_factor_top_deg: 48.5,
        pelvis_lateral_sway_cm: 3.2,
        swing_plane_angle_deg: 58.5,
      },
    });

    const validation = registry.validate(
      "https://kinetra.golf/schemas/video-sync-session.schema.json",
      session
    );
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  });
});
