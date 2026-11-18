// Kinetra — Parametric 3D CAD Model: Non-Destructive Keyed Magnetic Butt-Cap Mount (14 Club Units)
// Specification: specs/01-hardware-imu-shaft.md §1.3.A
// Non-Destructive Attachment: Smooth Ø3.8mm vent-hole centering pin + Ø25mm 3M VHB adhesive pad (Zero spikes, Zero screw threads)

$fn = 96;

// --- Parametric Dimensions (mm) ---
club_slot_id            = 1;     // Club slot 1..14 engraved inside the mount
flange_diameter_mm      = 26.0;  // Smooth base flange resting on top of the grip
flange_height_mm        = 6.2;   // Total mount height above grip butt cap
vhb_pad_diameter_mm     = 25.0;  // 3M VHB double-sided adhesive pad diameter
vhb_pad_thickness_mm    = 0.5;   // 3M VHB thickness
vent_pin_diameter_mm    = 3.8;   // Smooth rounded centering pin entering factory grip vent hole
vent_pin_length_mm      = 10.0;  // Pin insertion depth (non-threaded, zero damage to rubber)

d_socket_diameter_mm    = 18.0;  // Asymmetric D-shaped female socket diameter
d_socket_flat_offset_mm = 7.0;   // D-flat keyway offset from center (single insertion orientation)
d_socket_depth_mm       = 3.5;   // Socket depth locking shear and torsion

pogo_pin_count          = 5;     // 5 contacts: D0, D1, D2, D3, GND
pogo_pitch_mm           = 2.0;   // 2.0mm pitch magnetic pogo target receptacle
pogo_body_length_mm     = 14.0;
pogo_body_width_mm      = 4.5;
solder_pocket_depth_mm  = 2.0;   // Rear epoxy potting pocket for 0.20mm² wire jumpers (D0..D3 -> GND)

module d_profile_2d(diam, flat_offset) {
    intersection() {
        circle(d = diam);
        translate([-diam/2, -diam/2])
            square([diam, diam/2 + flat_offset]);
    }
}

module smooth_vent_centering_pin() {
    translate([0, 0, -vent_pin_length_mm + vent_pin_diameter_mm/2]) {
        cylinder(d = vent_pin_diameter_mm, h = vent_pin_length_mm - vent_pin_diameter_mm/2);
        sphere(d = vent_pin_diameter_mm);
    }
}

module keyed_magnetic_butt_cap_mount() {
    difference() {
        union() {
            // 1. Smooth flat-bottom collar (no spikes) with chamfered top rim
            cylinder(d1 = flange_diameter_mm, d2 = flange_diameter_mm - 2.0, h = flange_height_mm);
            // 2. Smooth rounded centering pin for the factory grip vent hole
            smooth_vent_centering_pin();
            // 3. Prominent 3D raised '▲ FACE' alignment arrow protruding at +Y (towards clubface leading edge)
            translate([0, flange_diameter_mm/2 - 1.5, 0])
                cylinder(d = 6.4, h = flange_height_mm + 0.6, $fn = 3);
            // 4. Two lateral Snap-Fit locking lugs (-X and +X) for the sensor pod's side clips
            translate([-flange_diameter_mm/2 - 1.2, -3.5, 1.5])
                cube([2.0, 7.0, 3.0]);
            translate([+flange_diameter_mm/2 - 0.8, -3.5, 1.5])
                cube([2.0, 7.0, 3.0]);
        }

        // 3. Asymmetric D-keyed female socket on top
        translate([0, 0, flange_height_mm - d_socket_depth_mm])
            linear_extrude(height = d_socket_depth_mm + 0.1)
                d_profile_2d(d_socket_diameter_mm, d_socket_flat_offset_mm);

        // 4. 5-Pin Magnetic Pogo female target cutout + rear epoxy wire-jumper pocket
        translate([-pogo_body_length_mm/2, -pogo_body_width_mm/2, flange_height_mm - d_socket_depth_mm - solder_pocket_depth_mm])
            cube([pogo_body_length_mm, pogo_body_width_mm, solder_pocket_depth_mm + 0.5]);

        // 5. Front Leading-Edge Alignment Arrow notch (+X_c towards clubface normal)
        translate([0, flange_diameter_mm/2 - 1.8, flange_height_mm - 0.8])
            cylinder(d = 2.2, h = 1.0, $fn = 3);
    }
}

keyed_magnetic_butt_cap_mount();
