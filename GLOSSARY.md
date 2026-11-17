# Kinetra

Biomechanical and ballistic golf swing analysis domain combining club-mounted inertial telemetry, dual-angle high-speed video kinematics, club bag equipment profiling, and aerodynamic flight simulation.

## Sensor & Club Mechanics

**GeoTrick IMU**:
The club-mounted sensing module built around the Seeed Studio XIAO BLE nRF52840 Sense (`102010469`), integrating a 6-DoF inertial sensor (`LSM6DS3TR-C`: 3-axis $\pm 16\,g$ accelerometer and 3-axis $\pm 2000^\circ/\text{s}$ gyroscope up to $1660\text{ Hz}$, without magnetometer), an onboard digital PDM microphone (`MP34DT05-A`), an $85\text{ mAh}$ LiPo battery (`L301525`), and a 4-bit GPIO mount reader at the top extremity of the grip ($s = 0$).
_Avoid_: 9-axis sensor, magnetometer IMU, smart club, shaft-collar sensor

**Keyed Butt-Cap Mount**:
A passive mechanical socket fixed to the top of each club's grip and aligned with the clubface leading edge, featuring an asymmetric mechanical keyway (single insertion orientation) and a 4-bit hardwired binary jumper (`D0..D3` to `GND`) that uniquely encodes the club's `mount_slot_id` (`1` through `14`, with `15`/`0b1111` indicating unmounted).
_Avoid_: Generic clip, unindexed mount, NFC tag mount

**Wake-on-Use Power Mode**:
The ultra-low-power state machine on the GeoTrick IMU that keeps the BLE radio disabled during storage (`DEEP_SLEEP_UNMOUNTED`) and while a mounted club rests idle (`STANDBY_MOUNTED_IDLE`), waking the radio and high-rate sensors only upon hardware GPIO mount detection or `LSM6DS3TR-C` hardware motion interrupt (`INT1`).
_Avoid_: Always-on BLE, manual BLE pairing button

**Impact Clipping Signature**:
The composite mechanical waveform captured at the butt cap during ball strike, combining accelerometer saturation clipping at the $\pm 16\,g$ ceiling, post-impact vibrational ring-down energy (below $16\,g$), and axial gyroscope torsional impulse ($\Delta \omega_z$) used to detect ball strike and classify impact location on the clubface (`heel`, `center`, `toe`).
_Avoid_: Raw peak g, simple threshold trigger

**Shaft Deflection**:
The combined elastic deformation of the golf shaft during the swing, decomposed into lead/lag bending (along the swing plane), shaft droop (toe-down bending perpendicular to the swing plane), and torsional twist around the shaft axis.
_Avoid_: Shaft flex error, club bend

**Compensated Clubface Orientation**:
The true 3D orientation (dynamic loft and face angle) of the clubhead at impact after applying the shaft deflection model (accounting for shaft material and flex profile) to the raw GeoTrick IMU orientation measured near the grip.
_Avoid_: Raw IMU angle, uncompensated face angle

## Video Capture & Synchronization

**Single-Camera Session (v1)**:
The v1 capture topology pairing a single smartphone (operating either in Down-The-Line View or Face-On View) directly with the GeoTrick IMU over BLE, extensible to synchronized Dual-Camera capture in v2.
_Avoid_: Multi-cam mandatory setup

**Face-On View**:
A camera perspective positioned perpendicular to the target line facing the golfer's chest, capturing full-body kinematics, hip/shoulder rotation, and weight transfer.
_Avoid_: Front view, side camera

**Down-The-Line View (DTL)**:
A camera perspective positioned behind the golfer along the target line looking toward the target, capturing the swing plane and the initial ball launch window.
_Avoid_: Rear view, back camera

**Impact Sync Anchor**:
The shared temporal reference instant ($t = 0$) aligning the GeoTrick IMU stream, Face-On video, and DTL video via the acoustic transient of club-ball impact or a synchronized optical flash marker.
_Avoid_: Timestamp offset, manual frame sync

**Spatial Calibration Frame**:
The pre-session geometric reference established via virtual spirit level (gravity vector) and ground visual markers defining the target line and ball address position.
_Avoid_: Camera setup, alignment check

## Equipment & Ballistics

**Club Profile**:
The physical specification of a single club in the golfer's bag, comprising club category, head brand/model, static loft, shaft material (`steel` or `graphite`), shaft flex rating, and length.
_Avoid_: Equipment item, club metadata

**Ball Profile**:
The aerodynamic and restitution characterization of the golf ball (`range_ball` for practice range balls vs. `tour_ball` for multi-layer course balls such as Pro V1), governing initial velocity retention, spin decay, and drag/lift coefficients.
_Avoid_: Ball type, golf ball

**Dry Swing**:
A full golf swing executed without striking a ball (on a mat or turf), evaluated for swing plane, tempo, and compensated clubhead kinematics at the virtual impact point (maximum clubhead speed / low point) without ball flight simulation.
_Avoid_: Practice swing error, missed hit

**Simulation Fixture**:
A deterministic, time-synchronized dataset bundling a raw IMU telemetry trace, Face-On video, DTL video, acoustic track, Club Profile, and Ball Profile used to replay a swing offline in the Simulation Harness.
_Avoid_: Mock data, test sample
