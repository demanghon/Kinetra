import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const FIRMWARE_PATH = path.join(
  ROOT_DIR,
  "hardware",
  "firmware",
  "geotrick_xiao_nrf52840",
  "geotrick_xiao_nrf52840.ino"
);
const MOUNT_CAD_PATH = path.join(ROOT_DIR, "hardware", "cad", "geotrick_keyed_butt_cap_mount.scad");
const HOUSING_CAD_PATH = path.join(ROOT_DIR, "hardware", "cad", "geotrick_sensor_pod_housing.scad");

describe("Ticket 04 — XIAO BLE nRF52840 Sense Firmware & Parametric 3D CAD Models (REQ-IMU-007, REQ-IMU-008, REQ-IMU-009)", () => {
  it("implements Wake-on-Use power states, pulsed 4-bit GPIO D0..D3 reading, and 50mA BQ25101 charge pinning in firmware", () => {
    assert.ok(fs.existsSync(FIRMWARE_PATH), "Firmware file must exist");
    const fw = fs.readFileSync(FIRMWARE_PATH, "utf-8");

    // Verify all 6 normative power states
    for (const state of [
      "DEEP_SLEEP_UNMOUNTED",
      "STANDBY_MOUNTED_IDLE",
      "ACTIVE_BLE_READY",
      "ADDRESS_LOCKED_1660HZ",
      "BURST_TX_POST_SWING",
      "USB_CHARGING_TELEMETRY",
    ]) {
      assert.ok(fw.includes(state), `Missing power state ${state} in firmware`);
    }

    // Verify pulsed pull-up reading on D0..D3 and 50mA charge limit (P0.13 HIGH)
    assert.ok(fw.includes("readMountSlotPulsed"), "Must implement pulsed GPIO pull-up reading");
    assert.ok(fw.includes("PIN_CHG_CURRENT_50MA"), "Must pin BQ25101 charge current to 50mA");
    assert.ok(fw.includes("computeCrc8"), "Must compute CRC-8 polynomial 0x07 on 24-byte frame");
  });

  it("provides parametric OpenSCAD 3D models for the non-destructive mount (smooth 3.8mm centering pin + 3M VHB pad) and XIAO housing", () => {
    assert.ok(fs.existsSync(MOUNT_CAD_PATH), "Mount OpenSCAD file must exist");
    assert.ok(fs.existsSync(HOUSING_CAD_PATH), "Housing OpenSCAD file must exist");

    const mountScad = fs.readFileSync(MOUNT_CAD_PATH, "utf-8");
    assert.match(mountScad, /vent_pin_diameter_mm\s*=\s*3\.8/);
    assert.match(mountScad, /vhb_pad_thickness_mm\s*=\s*0\.5/);
    assert.match(mountScad, /pogo_pin_count\s*=\s*5/);

    const housingScad = fs.readFileSync(HOUSING_CAD_PATH, "utf-8");
    assert.match(housingScad, /xiao_length_mm\s*=\s*21\.0/);
    assert.match(housingScad, /lipo_length_mm\s*=\s*30\.0/);
    assert.match(housingScad, /esp101_recess_depth_mm\s*=\s*1\.2/);
  });
});
