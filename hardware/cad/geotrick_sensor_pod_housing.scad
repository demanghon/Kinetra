// Kinetra — Parametric 3D CAD Model: GeoTrick Sensor Pod Housing (Seeed XIAO BLE nRF52840 Sense + LiPo L301525 + ESP101)
// Specification: specs/01-hardware-imu-shaft.md §1.3.B

$fn = 96;

// --- Exact Component Dimensions from User BOM (mm) ---
xiao_length_mm          = 21.0;  // Seeed XIAO BLE nRF52840 Sense (102010469)
xiao_width_mm           = 17.5;
xiao_thickness_mm       = 3.5;

lipo_length_mm          = 30.0;  // Accu LiPo 3.7V 85mAh L301525 (09958)
lipo_width_mm           = 15.0;
lipo_thickness_mm       = 2.5;
vhb_cushion_mm          = 0.5;   // 3M VHB vibration-damping cushion under LiPo

esp101_length_mm        = 8.5;   // Miniature slide switch ESP101 (07179)
esp101_width_mm         = 3.5;
esp101_recess_depth_mm  = 1.2;   // Flush guard recess preventing accidental switch-off during swing

pod_outer_length_mm     = 34.0;
pod_outer_width_mm      = 24.0;
pod_total_height_mm     = 11.5;

d_plug_diameter_mm      = 17.8;  // Male D-plug with 0.2mm clearance for the 18.0mm mount socket
d_plug_flat_offset_mm   = 6.9;
d_plug_height_mm        = 3.4;

pdm_acoustic_port_d_mm  = 1.2;   // Structure-borne acoustic channel to MP34DT05-A PDM microphone

module d_plug_2d(diam, flat_offset) {
    intersection() {
        circle(d = diam);
        translate([-diam/2, -diam/2])
            square([diam, diam/2 + flat_offset]);
    }
}

module rounded_pill_box(length, width, height) {
    hull() {
        translate([-(length - width)/2, 0, 0]) cylinder(d = width, h = height);
        translate([+(length - width)/2, 0, 0]) cylinder(d = width, h = height);
    }
}

module geotrick_sensor_pod_housing() {
    difference() {
        union() {
            // 1. Main low-profile aerodynamic shell
            rounded_pill_box(pod_outer_length_mm, pod_outer_width_mm, pod_total_height_mm);
            // 2. Bottom male D-keyed plug with 5-pin magnetic pogo connector boss
            translate([0, 0, -d_plug_height_mm])
                linear_extrude(height = d_plug_height_mm)
                    d_plug_2d(d_plug_diameter_mm, d_plug_flat_offset_mm);
        }

        // 3. Lower cradle for L301525 LiPo battery (30 x 15 x 2.5 mm + 0.5mm VHB cushion)
        translate([-lipo_length_mm/2, -lipo_width_mm/2, 1.5])
            cube([lipo_length_mm, lipo_width_mm, lipo_thickness_mm + vhb_cushion_mm]);

        // 4. Rigid upper bay for Seeed XIAO BLE nRF52840 Sense (21 x 17.5 mm)
        translate([-xiao_length_mm/2, -xiao_width_mm/2, 4.8])
            cube([xiao_length_mm, xiao_width_mm, xiao_thickness_mm + 1.5]);

        // 5. USB-C charging port access window
        translate([pod_outer_length_mm/2 - 4.0, -4.6, 5.0])
            cube([5.0, 9.2, 3.6]);

        // 6. Recessed ESP101 master switch guard (1.2mm flush guard)
        translate([-esp101_length_mm/2, pod_outer_width_mm/2 - esp101_recess_depth_mm - 1.5, 4.5])
            cube([esp101_length_mm, esp101_width_mm, 4.0]);

        // 7. Ø1.2mm acoustic waveguide from bottom D-plug to onboard MP34DT05-A PDM microphone
        translate([0, 0, -d_plug_height_mm - 0.1])
            cylinder(d = pdm_acoustic_port_d_mm, h = d_plug_height_mm + 6.0);
    }
}

geotrick_sensor_pod_housing();
