# 04: XIAO BLE nRF52840 Sense Firmware (`Wake-on-Use` + 50mA Charge) & Printable 3D CAD Models (`.scad` / `.stl`)

**What to build:** The embedded firmware for the Seeed Studio XIAO BLE nRF52840 Sense (`102010469`) implementing the ultra-low-power `Wake-on-Use` state machine (BLE disabled when unmounted `D0..D3 == 1111` or idle $>20\text{ s}$, hardware wake-up via `GPIOTE PORT` or `LSM6DS3TR-C INT1`), 4-bit passive mount slot reading (`1..14`), `BQ25101` $50\text{ mA}$ charging telemetry (`P0.13 = HIGH`, `P0.17` charge status, `ESP101` switch-off detection), and $1000\text{ Hz}$ circular RAM buffer burst transmission, accompanied by parametric OpenSCAD 3D models for the non-destructive `Keyed Magnetic Butt-Cap Mount` (smooth $\varnothing 3.8\text{ mm}$ vent centering pin + 3M VHB pad + 5-pin magnetic pogo receptacle) and the `GeoTrick Sensor Pod Housing`.

**Blocked by:** 01: Simulation Harness & JSON Schema Draft 2020-12 Contract Validator (`sim-harness`)

**Status:** ready-for-agent

- [ ] Implements the `Wake-on-Use` power state machine (`DEEP_SLEEP_UNMOUNTED`, `STANDBY_MOUNTED_IDLE`, `ACTIVE_BLE_READY`, `ADDRESS_LOCKED_1660HZ`, `BURST_TX_POST_SWING`, `USB_CHARGING_TELEMETRY`) with pulsed pull-up sampling on `D0..D3` (`REQ-IMU-007`, `REQ-IMU-008`).
- [ ] Pins `BQ25101` charging current to $50\text{ mA}$ and broadcasts live battery voltage, percentage, charging phase, and `SWITCH_OFF_DURING_CHARGE_WARNING` (`REQ-IMU-009`).
- [ ] Provides parametric 3D printable CAD models (`.scad`) for the sensor housing and the 14 non-destructive keyed mounts.
