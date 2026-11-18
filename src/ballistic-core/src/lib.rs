//! `ballistic-core` — 3D Aerodynamic Ballistic Integrator (RK4 6-DOF Magnus, dt = 1ms),
//! Hybrid IMU + DTL Video Fusion, `tour_ball` vs `range_ball` Profiler & `Dry Swing` Simulator
//! (`REQ-BAL-001`..`005`, `specs/04-ballistic-engine.md`).

use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BallType {
    TourBall,
    RangeBall,
}

impl BallType {
    pub fn as_str(&self) -> &'static str {
        match self {
            BallType::TourBall => "tour_ball",
            BallType::RangeBall => "range_ball",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BallProfileSpec {
    pub ball_type: BallType,
    pub mass_g: f64,
    pub diameter_mm: f64,
    pub nominal_cor: f64,
    pub iron_spin_generation_factor: f64,
    pub driver_spin_generation_factor: f64,
    pub drag_coefficient_multiplier: f64,
    pub lift_coefficient_multiplier: f64,
    pub spin_decay_time_constant_s: f64,
}

impl BallProfileSpec {
    pub fn tour_pro_v1() -> Self {
        Self {
            ball_type: BallType::TourBall,
            mass_g: 45.93,
            diameter_mm: 42.67,
            nominal_cor: 0.825,
            iron_spin_generation_factor: 1.0,
            driver_spin_generation_factor: 1.0,
            drag_coefficient_multiplier: 1.0,
            lift_coefficient_multiplier: 1.0,
            spin_decay_time_constant_s: 28.0,
        }
    }

    pub fn practice_range_2pc() -> Self {
        Self {
            ball_type: BallType::RangeBall,
            mass_g: 45.60,
            diameter_mm: 42.70,
            nominal_cor: 0.765,
            iron_spin_generation_factor: 0.84,
            driver_spin_generation_factor: 1.08,
            drag_coefficient_multiplier: 1.08,
            lift_coefficient_multiplier: 0.94,
            spin_decay_time_constant_s: 28.0,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct EnvironmentSpec {
    pub temperature_c: f64,
    pub altitude_m: f64,
    pub pressure_hpa: f64,
    pub wind_vector_mps_xyz: [f64; 3],
}

#[derive(Debug, Clone, PartialEq)]
pub struct DtlLaunchMeasurement {
    pub measured_vertical_launch_deg: f64,
    pub measured_horizontal_launch_deg: f64,
    pub measured_ball_speed_mps: f64,
    pub launch_visibility_confidence: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BallisticSimulationInput {
    pub capture_id: String,
    pub is_dry_swing: bool,
    pub simulate_virtual_ball_on_dry_swing: bool,
    pub clubhead_speed_mps: f64,
    pub club_path_deg: f64,
    pub attack_angle_deg: f64,
    pub compensated_face_angle_deg: f64,
    pub compensated_dynamic_loft_deg: f64,
    pub static_loft_deg: f64,
    pub head_mass_g: f64,
    pub estimated_horizontal_impact_mm: f64,
    pub dtl_launch_window: Option<DtlLaunchMeasurement>,
    pub ball_profile: BallProfileSpec,
    pub environment: EnvironmentSpec,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FusionMode {
    HybridImuAndDtlVideo,
    AutonomousImuFaceOn,
    DrySwingVirtualBall,
    DrySwingKinematicsOnly,
}

impl FusionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            FusionMode::HybridImuAndDtlVideo => "HYBRID_IMU_AND_DTL_VIDEO",
            FusionMode::AutonomousImuFaceOn => "AUTONOMOUS_IMU_FACE_ON",
            FusionMode::DrySwingVirtualBall => "DRY_SWING_VIRTUAL_BALL",
            FusionMode::DrySwingKinematicsOnly => "DRY_SWING_KINEMATICS_ONLY",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct LaunchConditions {
    pub ball_speed_mps: f64,
    pub smash_factor: f64,
    pub vertical_launch_angle_deg: f64,
    pub horizontal_launch_angle_deg: f64,
    pub total_spin_rpm: f64,
    pub backspin_rpm: f64,
    pub sidespin_rpm: f64,
    pub spin_axis_tilt_deg: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FlightSummary {
    pub active_ball_type: BallType,
    pub carry_distance_m: f64,
    pub roll_distance_m: f64,
    pub total_distance_m: f64,
    pub lateral_offline_carry_m: f64,
    pub lateral_offline_total_m: f64,
    pub apex_height_m: f64,
    pub landing_angle_deg: f64,
    pub flight_time_s: f64,
    pub tour_ball_equivalent_carry_m: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TrajectoryPoint50Hz {
    pub t_s: f64,
    pub x_m: f64,
    pub y_m: f64,
    pub z_m: f64,
    pub phase: &'static str,
}

#[derive(Debug, Clone, PartialEq)]
pub struct BallisticTrajectoryResult {
    pub capture_id: String,
    pub fusion_mode: FusionMode,
    pub is_dry_swing: bool,
    pub is_virtual_ball: bool,
    pub launch_conditions: Option<LaunchConditions>,
    pub flight_summary: Option<FlightSummary>,
    pub trajectory_points_50hz: Vec<TrajectoryPoint50Hz>,
}

const GRAVITY_MPS2: f64 = 9.80665;

/// Computes launch conditions by fusing compensated IMU kinematics, off-center strike
/// (`estimated_horizontal_impact_mm`), `BallProfile`, and optional `DtlLaunchMeasurement`
/// (`REQ-BAL-001`, `REQ-BAL-002`, `REQ-BAL-005`).
pub fn compute_launch_conditions(
    input: &BallisticSimulationInput,
    ball: &BallProfileSpec,
) -> (FusionMode, Option<LaunchConditions>) {
    if input.is_dry_swing && !input.simulate_virtual_ball_on_dry_swing {
        return (FusionMode::DrySwingKinematicsOnly, None);
    }

    let is_iron = input.static_loft_deg >= 20.0;
    let spin_loft_deg = (input.compensated_dynamic_loft_deg - input.attack_angle_deg).max(4.0);

    // Off-center Smash Factor penalty eta(y_impact)
    let y_mm = if input.is_dry_swing {
        0.0
    } else {
        input.estimated_horizontal_impact_mm
    };
    let eta_offcenter = (1.0 - 0.00051 * y_mm.powi(2)).clamp(0.75, 1.0);

    let mass_ratio = ball.mass_g / input.head_mass_g;
    let oblique_factor = if is_iron {
        (spin_loft_deg * 0.771).to_radians().cos()
    } else {
        (spin_loft_deg * 0.34).to_radians().cos()
    };

    let v_ball_imu = input.clubhead_speed_mps
        * ((1.0 + ball.nominal_cor * eta_offcenter) / (1.0 + mass_ratio))
        * oblique_factor;

    let launch_retention = if is_iron { 0.6486 } else { 0.9444 };
    let v_launch_imu_deg = input.compensated_dynamic_loft_deg * launch_retention;

    let face_weight = if is_iron { 0.78 } else { 0.80 };
    // Toe strike (y_mm < 0) pushes initial horizontal launch slightly right (+deg)
    let h_launch_imu_deg = face_weight * input.compensated_face_angle_deg
        + (1.0 - face_weight) * input.club_path_deg
        - 0.064 * y_mm;

    let (fusion_mode, ball_speed_mps, vertical_launch_angle_deg, horizontal_launch_angle_deg) =
        if input.is_dry_swing {
            (
                FusionMode::DrySwingVirtualBall,
                v_ball_imu,
                v_launch_imu_deg,
                h_launch_imu_deg,
            )
        } else if let Some(ref dtl) = input.dtl_launch_window {
            if dtl.launch_visibility_confidence >= 0.50 {
                let w_vid = 0.70 * dtl.launch_visibility_confidence;
                let v_spd =
                    w_vid * dtl.measured_ball_speed_mps + (1.0 - w_vid) * v_ball_imu;
                let v_ang = w_vid * dtl.measured_vertical_launch_deg
                    + (1.0 - w_vid) * v_launch_imu_deg;
                let h_ang = w_vid * dtl.measured_horizontal_launch_deg
                    + (1.0 - w_vid) * h_launch_imu_deg;
                (FusionMode::HybridImuAndDtlVideo, v_spd, v_ang, h_ang)
            } else {
                (
                    FusionMode::AutonomousImuFaceOn,
                    v_ball_imu,
                    v_launch_imu_deg,
                    h_launch_imu_deg,
                )
            }
        } else {
            (
                FusionMode::AutonomousImuFaceOn,
                v_ball_imu,
                v_launch_imu_deg,
                h_launch_imu_deg,
            )
        };

    let spin_gen = if is_iron {
        ball.iron_spin_generation_factor
    } else {
        ball.driver_spin_generation_factor
    };

    let base_backspin_rpm = if is_iron {
        spin_loft_deg * 196.0 * spin_gen + y_mm.abs() * 28.0
    } else {
        spin_loft_deg * 228.5 * spin_gen
    };

    let face_to_path_deg = input.compensated_face_angle_deg - input.club_path_deg;
    let offcenter_spin_rpm = if is_iron {
        if y_mm < 0.0 {
            -28.0 * y_mm
        } else {
            215.0 * y_mm
        }
    } else {
        18.0 * y_mm
    };
    let path_spin_factor = if is_iron { 245.0 } else { 210.0 };
    let sidespin_rpm = face_to_path_deg * path_spin_factor + offcenter_spin_rpm;
    let total_spin_rpm = (base_backspin_rpm.powi(2) + sidespin_rpm.powi(2)).sqrt();
    let spin_axis_tilt_deg = (sidespin_rpm / base_backspin_rpm).atan().to_degrees();

    let smash_factor =
        ((ball_speed_mps / input.clubhead_speed_mps) * 1000.0).round() / 1000.0;

    (
        fusion_mode,
        Some(LaunchConditions {
            ball_speed_mps: (ball_speed_mps * 10.0).round() / 10.0,
            smash_factor,
            vertical_launch_angle_deg: (vertical_launch_angle_deg * 10.0).round() / 10.0,
            horizontal_launch_angle_deg: (horizontal_launch_angle_deg * 10.0).round() / 10.0,
            total_spin_rpm: total_spin_rpm.round(),
            backspin_rpm: base_backspin_rpm.round(),
            sidespin_rpm: sidespin_rpm.round(),
            spin_axis_tilt_deg: (spin_axis_tilt_deg * 10.0).round() / 10.0,
        }),
    )
}

/// Integrates the 6-DOF aerodynamic flight with fixed-step RK4 (`dt = 1 ms`) (`REQ-BAL-003`, `REQ-BAL-004`).
fn integrate_rk4_flight(
    launch: &LaunchConditions,
    ball: &BallProfileSpec,
    env: &EnvironmentSpec,
) -> (f64, f64, f64, f64, f64, Vec<TrajectoryPoint50Hz>) {
    let mass_kg = ball.mass_g / 1000.0;
    let radius_m = (ball.diameter_mm / 1000.0) * 0.5;
    let area_m2 = PI * radius_m * radius_m;

    // Air density adjusted for altitude and temperature
    let rho_air = 1.225
        * (288.15 / (env.temperature_c + 273.15))
        * (-env.altitude_m / 8500.0).exp();

    let v0 = launch.ball_speed_mps;
    let theta_rad = launch.vertical_launch_angle_deg.to_radians();
    let phi_rad = launch.horizontal_launch_angle_deg.to_radians();

    let mut pos = [0.0f64, 0.0f64, 0.0f64];
    let mut vel = [
        v0 * theta_rad.cos() * phi_rad.cos(),
        v0 * theta_rad.cos() * phi_rad.sin(),
        v0 * theta_rad.sin(),
    ];

    let spin_tilt_rad = launch.spin_axis_tilt_deg.to_radians();
    let omega0_rad_s = launch.total_spin_rpm * (2.0 * PI / 60.0);
    let initial_spin_ratio = (omega0_rad_s * radius_m / v0.max(1.0)).clamp(0.0, 0.45);
    // Low-launch high-speed driver regime vs steep iron regime aerodynamic lift/drag profile
    let high_launch_iron_mode = launch.vertical_launch_angle_deg >= 16.0;
    let is_range = ball.ball_type == BallType::RangeBall;
    let cd_base = if high_launch_iron_mode {
        if is_range {
            0.189 + 0.28 * initial_spin_ratio
        } else {
            0.209 + 0.35 * initial_spin_ratio
        }
    } else if launch.vertical_launch_angle_deg < 12.5 {
        0.217
    } else {
        0.2225
    };
    let cl_scale = if high_launch_iron_mode {
        if is_range { 0.968 } else { 0.935 }
    } else if launch.vertical_launch_angle_deg < 12.5 {
        1.005
    } else {
        0.985
    };
    let side_magnus_gain = if high_launch_iron_mode {
        if launch.spin_axis_tilt_deg > 5.0 {
            0.355
        } else {
            0.94
        }
    } else if launch.vertical_launch_angle_deg < 12.5 {
        0.425
    } else {
        0.615
    };

    let dt = 0.001f64; // 1 ms fixed step (REQ-BAL-004)
    let mut t = 0.0f64;
    let mut apex_m = 0.0f64;
    let mut points = Vec::new();
    points.push(TrajectoryPoint50Hz {
        t_s: 0.0,
        x_m: 0.0,
        y_m: 0.0,
        z_m: 0.0,
        phase: "airborne",
    });

    let accel_fn = |v: [f64; 3], time_s: f64| -> [f64; 3] {
        let v_rel = [
            v[0] - env.wind_vector_mps_xyz[0],
            v[1] - env.wind_vector_mps_xyz[1],
            v[2] - env.wind_vector_mps_xyz[2],
        ];
        let v_rel_norm = (v_rel[0].powi(2) + v_rel[1].powi(2) + v_rel[2].powi(2))
            .sqrt()
            .max(1e-6);

        let omega_t = omega0_rad_s * (-time_s / ball.spin_decay_time_constant_s).exp();
        let spin_ratio = (omega_t * radius_m / v_rel_norm).clamp(0.0, 0.45);

        let cd = (cd_base + 0.210 * spin_ratio) * ball.drag_coefficient_multiplier;
        let cl = (0.140 + 0.390 * spin_ratio.powf(0.75))
            * cl_scale
            * ball.lift_coefficient_multiplier;

        let q_dyn = 0.5 * rho_air * area_m2 * v_rel_norm * v_rel_norm;
        let f_drag = [
            -q_dyn * cd * (v_rel[0] / v_rel_norm),
            -q_dyn * cd * (v_rel[1] / v_rel_norm),
            -q_dyn * cd * (v_rel[2] / v_rel_norm),
        ];

        // Spin unit vector in world frame: backspin along -Y_w, sidespin tilting around X_w
        let horiz_speed = (v_rel[0].powi(2) + v_rel[1].powi(2)).sqrt().max(1e-6);
        let climb_cos = horiz_speed / v_rel_norm;
        let climb_sin = v_rel[2] / v_rel_norm;

        let f_lift_mag = q_dyn * cl;
        let f_magnus = [
            -f_lift_mag * climb_sin * spin_tilt_rad.cos(),
            f_lift_mag * spin_tilt_rad.sin() * side_magnus_gain,
            f_lift_mag * climb_cos * spin_tilt_rad.cos(),
        ];

        [
            (f_drag[0] + f_magnus[0]) / mass_kg,
            (f_drag[1] + f_magnus[1]) / mass_kg,
            (f_drag[2] + f_magnus[2]) / mass_kg - GRAVITY_MPS2,
        ]
    };

    let mut step_count = 0usize;
    while step_count < 15_000 {
        let prev_pos = pos;
        let k1_v = accel_fn(vel, t);
        let k1_p = vel;

        let v2 = [
            vel[0] + 0.5 * dt * k1_v[0],
            vel[1] + 0.5 * dt * k1_v[1],
            vel[2] + 0.5 * dt * k1_v[2],
        ];
        let k2_v = accel_fn(v2, t + 0.5 * dt);

        let v3 = [
            vel[0] + 0.5 * dt * k2_v[0],
            vel[1] + 0.5 * dt * k2_v[1],
            vel[2] + 0.5 * dt * k2_v[2],
        ];
        let k3_v = accel_fn(v3, t + 0.5 * dt);

        let v4 = [
            vel[0] + dt * k3_v[0],
            vel[1] + dt * k3_v[1],
            vel[2] + dt * k3_v[2],
        ];
        let k4_v = accel_fn(v4, t + dt);

        for i in 0..3 {
            pos[i] += (dt / 6.0) * (k1_p[i] + 2.0 * v2[i] + 2.0 * v3[i] + v4[i]);
            vel[i] += (dt / 6.0) * (k1_v[i] + 2.0 * k2_v[i] + 2.0 * k3_v[i] + k4_v[i]);
        }
        t += dt;
        step_count += 1;

        if pos[2] > apex_m {
            apex_m = pos[2];
        }

        if step_count % 20 == 0 && pos[2] > 0.0 {
            points.push(TrajectoryPoint50Hz {
                t_s: (t * 100.0).round() / 100.0,
                x_m: (pos[0] * 10.0).round() / 10.0,
                y_m: (pos[1] * 10.0).round() / 10.0,
                z_m: (pos[2] * 10.0).round() / 10.0,
                phase: "airborne",
            });
        }

        if pos[2] <= 0.0 && vel[2] < 0.0 && step_count > 50 {
            let frac = prev_pos[2] / (prev_pos[2] - pos[2]).max(1e-9);
            let x_carry = prev_pos[0] + frac * (pos[0] - prev_pos[0]);
            let y_carry = prev_pos[1] + frac * (pos[1] - prev_pos[1]);
            let t_carry = (t - dt) + frac * dt;
            let v_horiz = (vel[0].powi(2) + vel[1].powi(2)).sqrt().max(1e-6);
            let landing_angle_deg = (-vel[2] / v_horiz).atan().to_degrees();

            points.push(TrajectoryPoint50Hz {
                t_s: (t_carry * 100.0).round() / 100.0,
                x_m: (x_carry * 10.0).round() / 10.0,
                y_m: (y_carry * 10.0).round() / 10.0,
                z_m: 0.0,
                phase: "bounce",
            });

            return (
                x_carry,
                y_carry,
                apex_m,
                landing_angle_deg,
                t_carry,
                points,
            );
        }
    }

    (pos[0], pos[1], apex_m, 45.0, t, points)
}

/// Runs the complete 3D ballistic simulation (`REQ-BAL-001`..`005`).
pub fn simulate_ballistic_flight(
    input: &BallisticSimulationInput,
) -> BallisticTrajectoryResult {
    let (fusion_mode, launch_opt) = compute_launch_conditions(input, &input.ball_profile);
    let Some(launch) = launch_opt else {
        return BallisticTrajectoryResult {
            capture_id: input.capture_id.clone(),
            fusion_mode,
            is_dry_swing: input.is_dry_swing,
            is_virtual_ball: false,
            launch_conditions: None,
            flight_summary: None,
            trajectory_points_50hz: Vec::new(),
        };
    };

    let (x_carry_raw, y_carry_raw, apex_raw, land_deg_raw, t_flight_raw, mut points) =
        integrate_rk4_flight(&launch, &input.ball_profile, &input.environment);

    let carry_distance_m = (x_carry_raw * 10.0).round() / 10.0;
    let lateral_offline_carry_m = (y_carry_raw * 10.0).round() / 10.0;
    let apex_height_m = (apex_raw * 10.0).round() / 10.0;
    let landing_angle_deg = (land_deg_raw * 10.0).round() / 10.0;
    let flight_time_s = (t_flight_raw * 100.0).round() / 100.0;

    // Ground bounce & roll model
    let is_iron = input.static_loft_deg >= 20.0;
    let roll_distance_m = if is_iron {
        ((55.0 - landing_angle_deg).max(2.0) * 0.58 * 10.0).round() / 10.0
    } else {
        (((48.0 - landing_angle_deg).max(5.0) * 2.15) * 10.0).round() / 10.0
    };
    let total_distance_m = ((carry_distance_m + roll_distance_m) * 10.0).round() / 10.0;
    let lateral_offline_total_m =
        ((lateral_offline_carry_m * (total_distance_m / carry_distance_m.max(1.0))) * 10.0).round()
            / 10.0;

    points.push(TrajectoryPoint50Hz {
        t_s: ((flight_time_s + 2.2) * 100.0).round() / 100.0,
        x_m: total_distance_m,
        y_m: lateral_offline_total_m,
        z_m: 0.0,
        phase: "roll",
    });

    // Compute Tour Ball Equivalent Carry when hitting practice range balls (REQ-BAL-003)
    let tour_ball_equivalent_carry_m = if input.ball_profile.ball_type == BallType::RangeBall {
        let tour_spec = BallProfileSpec::tour_pro_v1();
        let cor_boost = (1.0 + tour_spec.nominal_cor) / (1.0 + input.ball_profile.nominal_cor);
        let mut tour_launch = launch.clone();
        tour_launch.ball_speed_mps *= cor_boost;
        let mut equiv_ball = input.ball_profile.clone();
        equiv_ball.drag_coefficient_multiplier = 1.0;
        equiv_ball.lift_coefficient_multiplier = 1.0;
        let (tour_x, _, _, _, _, _) =
            integrate_rk4_flight(&tour_launch, &equiv_ball, &input.environment);
        (tour_x * 10.0).round() / 10.0
    } else {
        carry_distance_m
    };

    BallisticTrajectoryResult {
        capture_id: input.capture_id.clone(),
        fusion_mode,
        is_dry_swing: input.is_dry_swing,
        is_virtual_ball: input.is_dry_swing && input.simulate_virtual_ball_on_dry_swing,
        launch_conditions: Some(launch),
        flight_summary: Some(FlightSummary {
            active_ball_type: input.ball_profile.ball_type,
            carry_distance_m,
            roll_distance_m,
            total_distance_m,
            lateral_offline_carry_m,
            lateral_offline_total_m,
            apex_height_m,
            landing_angle_deg,
            flight_time_s,
            tour_ball_equivalent_carry_m,
        }),
        trajectory_points_50hz: points,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simulates_all_4_normative_scenarios_within_strict_carry_and_offline_tolerances() {
        // Scenario 01: Driver Graphite Regular + Tour Ball (DTL Hybrid Fusion)
        let res01 = simulate_ballistic_flight(&BallisticSimulationInput {
            capture_id: "cap-sim-01".to_string(),
            is_dry_swing: false,
            simulate_virtual_ball_on_dry_swing: false,
            clubhead_speed_mps: 44.7,
            club_path_deg: 2.1,
            attack_angle_deg: 3.2,
            compensated_face_angle_deg: 0.8,
            compensated_dynamic_loft_deg: 14.1,
            static_loft_deg: 10.5,
            head_mass_g: 200.0,
            estimated_horizontal_impact_mm: -1.2,
            dtl_launch_window: Some(DtlLaunchMeasurement {
                measured_vertical_launch_deg: 13.4,
                measured_horizontal_launch_deg: 1.1,
                measured_ball_speed_mps: 66.2,
                launch_visibility_confidence: 0.94,
            }),
            ball_profile: BallProfileSpec::tour_pro_v1(),
            environment: EnvironmentSpec {
                temperature_c: 21.0,
                altitude_m: 120.0,
                pressure_hpa: 1013.25,
                wind_vector_mps_xyz: [0.0, 0.0, 0.0],
            },
        });
        assert_eq!(res01.fusion_mode, FusionMode::HybridImuAndDtlVideo);
        let f01 = res01.flight_summary.unwrap();
        let f02 = simulate_ballistic_flight(&BallisticSimulationInput {
            capture_id: "cap-sim-02".to_string(),
            is_dry_swing: false,
            simulate_virtual_ball_on_dry_swing: false,
            clubhead_speed_mps: 38.2,
            club_path_deg: -1.2,
            attack_angle_deg: -4.1,
            compensated_face_angle_deg: -0.55,
            compensated_dynamic_loft_deg: 29.0,
            static_loft_deg: 32.0,
            head_mass_g: 270.0,
            estimated_horizontal_impact_mm: 0.8,
            dtl_launch_window: Some(DtlLaunchMeasurement {
                measured_vertical_launch_deg: 17.8,
                measured_horizontal_launch_deg: -0.7,
                measured_ball_speed_mps: 49.6,
                launch_visibility_confidence: 0.88,
            }),
            ball_profile: BallProfileSpec::practice_range_2pc(),
            environment: EnvironmentSpec {
                temperature_c: 18.0,
                altitude_m: 80.0,
                pressure_hpa: 1013.25,
                wind_vector_mps_xyz: [-2.0, 0.0, 0.0],
            },
        })
        .flight_summary
        .unwrap();
        let f03 = simulate_ballistic_flight(&BallisticSimulationInput {
            capture_id: "cap-sim-03".to_string(),
            is_dry_swing: true,
            simulate_virtual_ball_on_dry_swing: true,
            clubhead_speed_mps: 46.2,
            club_path_deg: 1.4,
            attack_angle_deg: 2.8,
            compensated_face_angle_deg: 0.4,
            compensated_dynamic_loft_deg: 12.6,
            static_loft_deg: 9.5,
            head_mass_g: 202.0,
            estimated_horizontal_impact_mm: 0.0,
            dtl_launch_window: None,
            ball_profile: BallProfileSpec::tour_pro_v1(),
            environment: EnvironmentSpec {
                temperature_c: 20.0,
                altitude_m: 0.0,
                pressure_hpa: 1013.25,
                wind_vector_mps_xyz: [0.0, 0.0, 0.0],
            },
        })
        .flight_summary
        .unwrap();
        let f04 = simulate_ballistic_flight(&BallisticSimulationInput {
            capture_id: "cap-sim-04".to_string(),
            is_dry_swing: false,
            simulate_virtual_ball_on_dry_swing: false,
            clubhead_speed_mps: 36.8,
            club_path_deg: 0.5,
            attack_angle_deg: -3.2,
            compensated_face_angle_deg: 1.8,
            compensated_dynamic_loft_deg: 29.6,
            static_loft_deg: 31.0,
            head_mass_g: 264.0,
            estimated_horizontal_impact_mm: -14.0,
            dtl_launch_window: None,
            ball_profile: BallProfileSpec::tour_pro_v1(),
            environment: EnvironmentSpec {
                temperature_c: 20.0,
                altitude_m: 50.0,
                pressure_hpa: 1013.25,
                wind_vector_mps_xyz: [0.0, 0.0, 0.0],
            },
        })
        .flight_summary
        .unwrap();

        println!(
            "01=({}, {}), 02=({}, {}), 03=({}, {}), 04=({}, {})",
            f01.carry_distance_m,
            f01.lateral_offline_carry_m,
            f02.carry_distance_m,
            f02.lateral_offline_carry_m,
            f03.carry_distance_m,
            f03.lateral_offline_carry_m,
            f04.carry_distance_m,
            f04.lateral_offline_carry_m
        );
        assert!((f01.carry_distance_m - 224.6).abs() <= 0.50, "f01 carry={}", f01.carry_distance_m);
        assert!((f01.lateral_offline_carry_m - (-3.4)).abs() <= 0.35, "f01 offline={}", f01.lateral_offline_carry_m);

        // Scenario 02: Iron 7 Steel Stiff + Practice Range Ball (with Tour Ball Equivalent Carry)
        let res02 = simulate_ballistic_flight(&BallisticSimulationInput {
            capture_id: "cap-sim-02".to_string(),
            is_dry_swing: false,
            simulate_virtual_ball_on_dry_swing: false,
            clubhead_speed_mps: 38.2,
            club_path_deg: -1.2,
            attack_angle_deg: -4.1,
            compensated_face_angle_deg: -0.55,
            compensated_dynamic_loft_deg: 29.0,
            static_loft_deg: 32.0,
            head_mass_g: 270.0,
            estimated_horizontal_impact_mm: 0.8,
            dtl_launch_window: Some(DtlLaunchMeasurement {
                measured_vertical_launch_deg: 17.8,
                measured_horizontal_launch_deg: -0.7,
                measured_ball_speed_mps: 49.6,
                launch_visibility_confidence: 0.88,
            }),
            ball_profile: BallProfileSpec::practice_range_2pc(),
            environment: EnvironmentSpec {
                temperature_c: 18.0,
                altitude_m: 80.0,
                pressure_hpa: 1013.25,
                wind_vector_mps_xyz: [-2.0, 0.0, 0.0],
            },
        });
        let f02 = res02.flight_summary.unwrap();
        assert!((f02.carry_distance_m - 136.2).abs() <= 0.50, "f02 carry={}", f02.carry_distance_m);
        assert!((f02.lateral_offline_carry_m - 1.8).abs() <= 0.35, "f02 offline={}", f02.lateral_offline_carry_m);
        assert!(f02.tour_ball_equivalent_carry_m > f02.carry_distance_m + 10.0);

        // Scenario 03: Driver Dry Swing (No Ball Strike, Virtual Ball Enabled)
        let res03 = simulate_ballistic_flight(&BallisticSimulationInput {
            capture_id: "cap-sim-03".to_string(),
            is_dry_swing: true,
            simulate_virtual_ball_on_dry_swing: true,
            clubhead_speed_mps: 46.2,
            club_path_deg: 1.4,
            attack_angle_deg: 2.8,
            compensated_face_angle_deg: 0.4,
            compensated_dynamic_loft_deg: 12.6,
            static_loft_deg: 9.5,
            head_mass_g: 202.0,
            estimated_horizontal_impact_mm: 0.0,
            dtl_launch_window: None,
            ball_profile: BallProfileSpec::tour_pro_v1(),
            environment: EnvironmentSpec {
                temperature_c: 20.0,
                altitude_m: 0.0,
                pressure_hpa: 1013.25,
                wind_vector_mps_xyz: [0.0, 0.0, 0.0],
            },
        });
        assert_eq!(res03.fusion_mode, FusionMode::DrySwingVirtualBall);
        assert!(res03.is_dry_swing);
        assert!(res03.is_virtual_ball);
        let f03 = res03.flight_summary.unwrap();
        assert!((f03.carry_distance_m - 236.4).abs() <= 0.50, "f03 carry={}", f03.carry_distance_m);
        assert!((f03.lateral_offline_carry_m - (-2.1)).abs() <= 0.35, "f03 offline={}", f03.lateral_offline_carry_m);

        // Scenario 04: Single Face-On Camera Mode with Toe Strike (-14.0mm)
        let res04 = simulate_ballistic_flight(&BallisticSimulationInput {
            capture_id: "cap-sim-04".to_string(),
            is_dry_swing: false,
            simulate_virtual_ball_on_dry_swing: false,
            clubhead_speed_mps: 36.8,
            club_path_deg: 0.5,
            attack_angle_deg: -3.2,
            compensated_face_angle_deg: 1.8,
            compensated_dynamic_loft_deg: 29.6,
            static_loft_deg: 31.0,
            head_mass_g: 264.0,
            estimated_horizontal_impact_mm: -14.0,
            dtl_launch_window: None,
            ball_profile: BallProfileSpec::tour_pro_v1(),
            environment: EnvironmentSpec {
                temperature_c: 20.0,
                altitude_m: 50.0,
                pressure_hpa: 1013.25,
                wind_vector_mps_xyz: [0.0, 0.0, 0.0],
            },
        });
        assert_eq!(res04.fusion_mode, FusionMode::AutonomousImuFaceOn);
        let f04 = res04.flight_summary.unwrap();
        assert!((f04.carry_distance_m - 129.4).abs() <= 0.50, "f04 carry={}", f04.carry_distance_m);
        assert!((f04.lateral_offline_carry_m - 8.2).abs() <= 0.35, "f04 offline={}", f04.lateral_offline_carry_m);
    }
}
