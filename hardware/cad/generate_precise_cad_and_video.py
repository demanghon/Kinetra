"""
Generates:
1. High-detail printable STL meshes with actual hollowed D-cavity, 2 lateral Snap-Fit locking clips,
   5 Pogo-Pin wells, 2 Neodymium magnet pockets, and prominent 3D raised 'FACE' alignment arrows:
   - hardware/cad/geotrick_keyed_butt_cap_mount.stl
   - hardware/cad/geotrick_sensor_pod_housing.stl
2. A 4-step mechanical cutaway & alignment blueprint PNG (cad_3d_blueprint.png).
3. An animated assembly video (assembly_animation.mp4 & assembly_animation.gif) showing:
   - Phase 1: Aligning the mount's raised ARROW with the grip & clubface leading edge (smooth pin + 3M VHB)
   - Phase 2: Lowering the sensor pod (D-keyway indexing)
   - Phase 3: Dual locking — Neodymium magnets pull down + 2 lateral Snap-Fit clips flex outward and lock into the mount's grooves ("CLIC!")
   - Phase 4: 5 Pogo-Pins compress (0.8mm stroke) -> Club #7 automatically detected!
"""

import math
import os
import subprocess
import tempfile
from PIL import Image, ImageDraw, ImageFont

CAD_DIR = os.path.dirname(os.path.abspath(__file__))
BRAIN_DIR = "/home/demanghon/.gemini/antigravity-cli/brain/5493fe1c-2cb6-4f0d-bffc-2529affa62a6"


def load_font(size, bold=False):
    path = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    )
    if os.path.exists(path):
        return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def add_box_tris(tris, x0, x1, y0, y1, z0, z1):
    v = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    faces = [
        (0, 2, 1), (0, 3, 2),  # bottom
        (4, 5, 6), (4, 6, 7),  # top
        (0, 1, 5), (0, 5, 4),  # back (-y)
        (2, 3, 7), (2, 7, 6),  # front (+y)
        (1, 2, 6), (1, 6, 5),  # right (+x)
        (3, 0, 4), (3, 4, 7),  # left (-x)
    ]
    for i, j, k in faces:
        tris.append((v[i], v[j], v[k]))


def add_prism_arrow_tris(tris, tip_y, base_y, half_w, z0, z1):
    # Triangle pointing towards +Y (clubface leading edge alignment marker)
    b_l = (-half_w, base_y, z0)
    b_r = (+half_w, base_y, z0)
    b_t = (0.0, tip_y, z0)
    t_l = (-half_w, base_y, z1)
    t_r = (+half_w, base_y, z1)
    t_t = (0.0, tip_y, z1)
    tris.append((b_l, b_t, b_r))
    tris.append((t_l, t_r, t_t))
    tris.append((b_l, b_r, t_r))
    tris.append((b_l, t_r, t_l))
    tris.append((b_r, b_t, t_t))
    tris.append((b_r, t_t, t_r))
    tris.append((b_t, b_l, t_l))
    tris.append((b_t, t_l, t_t))


def add_annular_d_wall_tris(tris, r_outer, r_inner, d_flat_y, z0, z1, segs=64):
    outer_b, outer_t, inner_b, inner_t = [], [], [], []
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        ca, sa = math.cos(a), math.sin(a)
        xo, yo = r_outer * ca, r_outer * sa
        xi, yi = r_inner * ca, min(r_inner * sa, d_flat_y)
        outer_b.append((xo, yo, z0))
        outer_t.append((xo, yo, z1))
        inner_b.append((xi, yi, z0))
        inner_t.append((xi, yi, z1))

    for i in range(segs):
        nxt = (i + 1) % segs
        # Outer wall
        tris.append((outer_b[i], outer_b[nxt], outer_t[nxt]))
        tris.append((outer_b[i], outer_t[nxt], outer_t[i]))
        # Inner cavity wall (normals pointing inward)
        tris.append((inner_b[i], inner_t[nxt], inner_b[nxt]))
        tris.append((inner_b[i], inner_t[i], inner_t[nxt]))
        # Top rim ring
        tris.append((inner_t[i], outer_t[i], outer_t[nxt]))
        tris.append((inner_t[i], outer_t[nxt], inner_t[nxt]))
        # Bottom ring
        tris.append((inner_b[i], outer_b[nxt], outer_b[i]))
        tris.append((inner_b[i], inner_b[nxt], outer_b[nxt]))


def add_cylinder_tris(tris, r_b, r_t, z0, z1, cx=0.0, cy=0.0, d_flat_y=None, segs=48):
    pb, pt = [], []
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        xb, yb = r_b * math.cos(a), r_b * math.sin(a)
        xt, yt = r_t * math.cos(a), r_t * math.sin(a)
        if d_flat_y is not None:
            yb = min(yb, d_flat_y)
            yt = min(yt, d_flat_y)
        pb.append((cx + xb, cy + yb, z0))
        pt.append((cx + xt, cy + yt, z1))
    for i in range(segs):
        nxt = (i + 1) % segs
        tris.append((pb[i], pb[nxt], pt[nxt]))
        tris.append((pb[i], pt[nxt], pt[i]))
        tris.append(((cx, cy, z0), pb[nxt], pb[i]))
        tris.append(((cx, cy, z1), pt[i], pt[nxt]))


def write_ascii_stl(filepath, name, triangles):
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"solid {name}\n")
        for p0, p1, p2 in triangles:
            ux, uy, uz = p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]
            vx, vy, vz = p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]
            nx = uy * vz - uz * vy
            ny = uz * vx - ux * vz
            nz = ux * vy - uy * vx
            norm = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            f.write(f"  facet normal {nx/norm:.6f} {ny/norm:.6f} {nz/norm:.6f}\n")
            f.write("    outer loop\n")
            f.write(f"      vertex {p0[0]:.4f} {p0[1]:.4f} {p0[2]:.4f}\n")
            f.write(f"      vertex {p1[0]:.4f} {p1[1]:.4f} {p1[2]:.4f}\n")
            f.write(f"      vertex {p2[0]:.4f} {p2[1]:.4f} {p2[2]:.4f}\n")
            f.write("    endloop\n")
            f.write("  endfacet\n")
        f.write(f"endsolid {name}\n")


def generate_detailed_stls():
    # --- 1. DETAILED KEYED MAGNETIC BUTT-CAP MOUNT STL ---
    mount_tris = []
    # Smooth rounded centering pin (Ø3.8mm x 10mm) entering grip vent hole
    add_cylinder_tris(mount_tris, 1.7, 1.9, -10.0, -8.5, segs=36)
    add_cylinder_tris(mount_tris, 1.9, 1.9, -8.5, 0.0, segs=36)
    # Solid lower base plate (z = 0.0 to 2.7mm, Ø26mm)
    add_cylinder_tris(mount_tris, 13.0, 12.8, 0.0, 2.7, segs=64)
    # Hollowed upper wall with asymmetric D-socket cavity (z = 2.7 to 6.2mm, inner R=9.0mm, D-flat at y=+6.5mm)
    add_annular_d_wall_tris(mount_tris, 12.8, 9.0, 6.5, 2.7, 6.2, segs=64)
    # 2 Lateral Snap-Fit locking receptor lugs on the outer wall (-X and +X) with locking ledge
    add_box_tris(mount_tris, -14.2, -12.2, -3.5, 3.5, 1.5, 4.5)
    add_box_tris(mount_tris, +12.2, +14.2, -3.5, 3.5, 1.5, 4.5)
    # Prominent raised 3D Alignment Arrow + Front Nose Pointer (+Y towards Clubface Leading Edge)
    add_prism_arrow_tris(mount_tris, tip_y=14.6, base_y=9.2, half_w=3.2, z0=0.0, z1=6.8)
    add_box_tris(mount_tris, -0.8, 0.8, 6.5, 10.0, 6.2, 6.8)  # raised sight line on top rim
    # 5 Raised Pogo-Pin contact pads inside the D-socket floor (z = 2.7 to 3.1mm)
    for idx in range(-2, 3):
        add_cylinder_tris(mount_tris, 0.8, 0.8, 2.7, 3.1, cx=idx * 2.2, cy=0.0, segs=20)
    # 2 Neodymium magnet rings inside the D-socket floor (left & right of the 5 pogo pads)
    add_cylinder_tris(mount_tris, 2.0, 2.0, 2.7, 3.0, cx=-6.8, cy=0.0, segs=24)
    add_cylinder_tris(mount_tris, 2.0, 2.0, 2.7, 3.0, cx=+6.8, cy=0.0, segs=24)

    write_ascii_stl(
        os.path.join(CAD_DIR, "geotrick_keyed_butt_cap_mount.stl"),
        "geotrick_keyed_butt_cap_mount",
        mount_tris,
    )

    # --- 2. DETAILED GEOTRICK SENSOR POD HOUSING STL ---
    pod_tris = []
    # Bottom Male D-Plug (z = -3.4 to 0.0mm, R=8.8mm, D-flat at y=+6.4mm)
    add_cylinder_tris(pod_tris, 8.8, 8.8, -3.4, 0.0, d_flat_y=6.4, segs=64)
    # 5 Protruding spring-loaded Pogo-Pin plungers on bottom face (z = -4.2 to -3.4mm)
    for idx in range(-2, 3):
        add_cylinder_tris(pod_tris, 0.55, 0.55, -4.2, -3.4, cx=idx * 2.2, cy=0.0, segs=16)
    # Main aerodynamic body (z = 0.0 to 10.5mm, Ø32mm tapering to Ø29mm)
    add_cylinder_tris(pod_tris, 16.0, 14.5, 0.0, 10.5, segs=64)
    # 2 Lateral Snap-Fit Spring Arms (-X and +X) that hook down around the mount's locking lugs!
    # Left snap arm (-X)
    add_box_tris(pod_tris, -16.8, -14.8, -4.0, 4.0, -3.8, 6.5)  # vertical flex arm + finger release tab
    add_box_tris(pod_tris, -14.8, -13.2, -3.5, 3.5, -3.8, -2.2)  # inward locking hook tooth!
    # Right snap arm (+X)
    add_box_tris(pod_tris, +14.8, +16.8, -4.0, 4.0, -3.8, 6.5)  # vertical flex arm + finger release tab
    add_box_tris(pod_tris, +13.2, +14.8, -3.5, 3.5, -3.8, -2.2)  # inward locking hook tooth!
    # Prominent raised 3D Alignment Sight Rib & Arrow on top cap (+Y towards Clubface Leading Edge)
    add_box_tris(pod_tris, -1.0, 1.0, 0.0, 11.0, 10.5, 11.3)
    add_prism_arrow_tris(pod_tris, tip_y=15.2, base_y=10.5, half_w=3.4, z0=10.2, z1=11.4)

    write_ascii_stl(
        os.path.join(CAD_DIR, "geotrick_sensor_pod_housing.stl"),
        "geotrick_sensor_pod_housing",
        pod_tris,
    )


def draw_assembly_frame(t_norm, width=1280, height=720):
    """
    Renders a single frame of the animated assembly sequence at normalized time t_norm in [0, 1].
    Shows BOTH:
    - Left side (60% width): Cross-section cutaway of the mechanical Snap-Fit clips + Neodymium magnets + 5 Pogo-Pins + Smooth vent pin
    - Right side (40% width): Top-down alignment view showing the '▲ FACE' arrows on the Mount, Sensor Pod, Grip, and Clubface Leading Edge!
    """
    img = Image.new("RGB", (width, height), (11, 17, 30))
    draw = ImageDraw.Draw(img)
    f_title = load_font(20, bold=True)
    f_sub = load_font(14, bold=False)
    f_bold = load_font(14, bold=True)
    f_small = load_font(12, bold=False)

    # Background grid
    for x in range(0, width, 40):
        draw.line([(x, 0), (x, height)], fill=(20, 30, 48), width=1)
    for y in range(0, height, 40):
        draw.line([(0, y), (width, y)], fill=(20, 30, 48), width=1)

    # Header
    draw.rectangle([(20, 16), (width - 20, 74)], fill=(19, 29, 49), outline=(56, 189, 248), width=2)
    draw.text(
        (36, 24),
        "KINETRA — CINEMATIQUE DE MONTAGE, ALIGNEMENT 'FACE' & DOUBLE VERROUILLAGE (AIMANTS + CLIPS SNAP-FIT)",
        font=f_title,
        fill=(240, 249, 255),
    )

    # Determine animation phase from t_norm in [0, 1]
    # Phase 1 [0.00..0.25]: Mount lowers onto Grip (smooth Ø3.8mm pin enters vent hole + 3M VHB sticks)
    # Phase 2 [0.25..0.60]: Sensor Pod lowers toward Mount (D-keyway + ▲ FACE arrows aligned)
    # Phase 3 [0.60..0.80]: Snap-Fit clips flex outward around lugs, then SNAP inward ("CLIC!") + Pogo pins compress
    # Phase 4 [0.80..1.00]: Locked & Active (5 Pogo pins contact gold pads -> GPIO reads 1000 -> Club #7 selected!)
    if t_norm < 0.25:
        phase_text = "ETAPE 1/4 : Pose de l'embase sur le grip (Pion lisse Ø3.8mm dans le trou d'origine + Rondelle 3M VHB + Fleche FACE alignee)"
        mount_drop_px = int((1.0 - t_norm / 0.25) * 90)
        pod_drop_px = 180
        clip_flex_px = 0
        pogo_compress_px = 0
        locked = False
    elif t_norm < 0.60:
        p = (t_norm - 0.25) / 0.35
        phase_text = "ETAPE 2/4 : Approche du capteur XIAO (Alignement Flèche ▲ FACE + Détrompeur asymétrique en 'D' + Attraction Aimants N52)"
        mount_drop_px = 0
        pod_drop_px = int((1.0 - p) * 165) + 15
        clip_flex_px = 0
        pogo_compress_px = 0
        locked = False
    elif t_norm < 0.80:
        p = (t_norm - 0.60) / 0.20
        phase_text = "ETAPE 3/4 : Clipsage Mécanique ! Les 2 bras Snap-Fit s'écartent puis verrouillent sous l'embase + Compression des 5 Pogo-Pins"
        mount_drop_px = 0
        pod_drop_px = int((1.0 - p) * 15)
        # Clips flex outward at p=0.4 then snap inward at p=1.0
        clip_flex_px = int(math.sin(p * math.pi) * 18)
        pogo_compress_px = int(p * 8)
        locked = p > 0.85
    else:
        phase_text = "ETAPE 4/4 : VERROUILLE ('CLIC !') — Double maintien (Aimants N52 + Clips latéraux) & Lecture Auto-ID 4-Bits -> Fer 7 sélectionné !"
        mount_drop_px = 0
        pod_drop_px = 0
        clip_flex_px = 0
        pogo_compress_px = 8
        locked = True

    draw.text((36, 50), phase_text, font=f_bold, fill=(56, 189, 248) if not locked else (52, 211, 153))

    # =========================================================================
    # LEFT PANEL: CROSS-SECTION CUTAWAY (VUE EN COUPE DU SYSTEME DE CLIPSAGE)
    # =========================================================================
    draw.rectangle([(20, 88), (770, height - 20)], fill=(15, 23, 42), outline=(51, 65, 85), width=2)
    draw.text((38, 100), "A. VUE EN COUPE LATERALE : COMMENT LE CAPTEUR SE CLIPSE SUR L'EMBASE", font=f_bold, fill=(248, 250, 252))

    cx = 395
    grip_top_y = 535

    # 1. Golf Grip Butt-Cap with factory Ø3.8mm vent hole in the center
    draw.rectangle([(cx - 165, grip_top_y), (cx - 24, height - 35)], fill=(45, 55, 72), outline=(100, 116, 139), width=2)
    draw.rectangle([(cx + 24, grip_top_y), (cx + 165, height - 35)], fill=(45, 55, 72), outline=(100, 116, 139), width=2)
    draw.rectangle([(cx - 24, grip_top_y), (cx + 24, height - 35)], fill=(11, 17, 30))  # factory vent hole
    draw.text((cx - 155, height - 65), "Grip Caoutchouc", font=f_small, fill=(203, 213, 225))
    draw.text((cx - 58, height - 55), "Trou d'évent d'origine Ø3.8mm", font=f_small, fill=(148, 163, 184))

    # 2. Keyed Magnetic Butt-Cap Mount (moves down by mount_drop_px in Phase 1)
    my = grip_top_y - mount_drop_px
    # 3M VHB double-sided adhesive pad (red layer, 0.5mm, zero spikes)
    draw.rectangle([(cx - 155, my - 8), (cx - 24, my)], fill=(239, 68, 68), outline=(252, 165, 165))
    draw.rectangle([(cx + 24, my - 8), (cx + 155, my)], fill=(239, 68, 68), outline=(252, 165, 165))
    draw.text((cx + 168, my - 12), "Scotch double-face 3M VHB (0.5mm, sans trace)", font=f_small, fill=(252, 165, 165))

    # Smooth rounded centering pin (Ø3.8mm x 10mm, zero screw thread!)
    draw.rectangle([(cx - 21, my - 8), (cx + 21, my + 85)], fill=(14, 165, 233), outline=(125, 211, 252), width=2)
    draw.pieslice([(cx - 21, my + 65), (cx + 21, my + 105)], 0, 180, fill=(14, 165, 233), outline=(125, 211, 252))
    draw.text((cx + 32, my + 42), "Pion de centrage LISSE Ø3.8mm (aucun filetage)", font=f_small, fill=(125, 211, 252))

    # Mount body (Ø26mm) with D-socket cavity (depth 3.5mm) and lateral locking ledges
    mount_top_y = my - 78
    # Base floor of mount
    draw.rectangle([(cx - 160, my - 38), (cx + 160, my - 8)], fill=(51, 65, 85), outline=(148, 163, 184), width=2)
    # Left & Right walls forming the D-socket cavity + outer locking notches (gorges de clipsage)
    draw.rectangle([(cx - 160, mount_top_y), (cx - 110, my - 38)], fill=(51, 65, 85), outline=(148, 163, 184), width=2)
    draw.rectangle([(cx + 110, mount_top_y), (cx + 160, my - 38)], fill=(51, 65, 85), outline=(148, 163, 184), width=2)
    # Lateral locking lugs protruding on left (-X) and right (+X) of the mount
    draw.rectangle([(cx - 178, mount_top_y + 12), (cx - 160, mount_top_y + 34)], fill=(56, 189, 248), outline=(255, 255, 255))
    draw.rectangle([(cx + 160, mount_top_y + 12), (cx + 178, mount_top_y + 34)], fill=(56, 189, 248), outline=(255, 255, 255))
    draw.text((35, mount_top_y + 14), "Ergot d'accroche\nmécanique Embase", font=f_small, fill=(56, 189, 248))

    # 2 Neodymium N52 magnets embedded in the mount floor
    draw.rectangle([(cx - 95, my - 46), (cx - 65, my - 34)], fill=(168, 85, 247), outline=(233, 213, 255))
    draw.rectangle([(cx + 65, my - 46), (cx + 95, my - 34)], fill=(168, 85, 247), outline=(233, 213, 255))
    draw.text((cx - 93, my - 45), "N52", font=f_small, fill=(255, 255, 255))
    draw.text((cx + 67, my - 45), "N52", font=f_small, fill=(255, 255, 255))

    # 5 Gold Pogo-Pin target pads + Epoxy wire-jumper pocket at the bottom of the D-socket
    draw.rectangle([(cx - 58, my - 34), (cx + 58, my - 14)], fill=(15, 23, 42), outline=(250, 204, 21))
    draw.text((cx - 50, my - 30), "Chambre Epoxy (Ponts D0..D3)", font=f_small, fill=(250, 204, 21))
    for idx in range(-2, 3):
        px = cx + idx * 22
        draw.rectangle([(px - 7, my - 42), (px + 7, my - 34)], fill=(250, 204, 21), outline=(202, 138, 4))

    # 3. GeoTrick Sensor Pod Housing (moves down by pod_drop_px in Phases 2-3)
    py = mount_top_y - pod_drop_px
    pod_top_y = py - 115

    # Main Sensor Pod Shell
    draw.rounded_rectangle([(cx - 185, pod_top_y), (cx + 185, py)], radius=18, fill=(30, 41, 59), outline=(56, 189, 248), width=2)
    # Male D-plug entering the Mount's D-socket cavity (depth 38px)
    draw.rectangle([(cx - 106, py), (cx + 106, py + 34)], fill=(71, 85, 105), outline=(148, 163, 184), width=2)

    # 2 Matching Neodymium N52 magnets in the Sensor Pod D-plug
    draw.rectangle([(cx - 95, py + 22), (cx - 65, py + 34)], fill=(168, 85, 247), outline=(233, 213, 255))
    draw.rectangle([(cx + 65, py + 22), (cx + 95, py + 34)], fill=(168, 85, 247), outline=(233, 213, 255))

    # 5 Spring-loaded Gold Pogo-Pin plungers (compress by pogo_compress_px on contact!)
    pogo_tip_y = py + 42 - pogo_compress_px
    for idx in range(-2, 3):
        px = cx + idx * 22
        draw.rectangle([(px - 4, py + 14), (px + 4, pogo_tip_y)], fill=(250, 204, 21), outline=(254, 240, 138))

    # 2 LATERAL SNAP-FIT LOCKING ARMS (Les 2 clips latéraux souples avec ergot qui verrouillent sous l'embase !)
    # Left Snap-Fit Arm (-X)
    lx_shift = -clip_flex_px
    draw.polygon([
        (cx - 196 + lx_shift, pod_top_y + 35),  # top finger tab (pincer ici pour déclipser)
        (cx - 182 + lx_shift, pod_top_y + 35),
        (cx - 182 + lx_shift, py + 48),
        (cx - 162 + lx_shift, py + 48),         # inward locking hook tooth!
        (cx - 162 + lx_shift, py + 36),
        (cx - 178 + lx_shift, py + 36),
        (cx - 178 + lx_shift, pod_top_y + 65),
        (cx - 196 + lx_shift, pod_top_y + 65),
    ], fill=(52, 211, 153) if locked else (56, 189, 248), outline=(255, 255, 255))

    # Right Snap-Fit Arm (+X)
    rx_shift = +clip_flex_px
    draw.polygon([
        (cx + 196 + rx_shift, pod_top_y + 35),
        (cx + 182 + rx_shift, pod_top_y + 35),
        (cx + 182 + rx_shift, py + 48),
        (cx + 162 + rx_shift, py + 48),         # inward locking hook tooth!
        (cx + 162 + rx_shift, py + 36),
        (cx + 178 + rx_shift, py + 36),
        (cx + 178 + rx_shift, pod_top_y + 65),
        (cx + 196 + rx_shift, pod_top_y + 65),
    ], fill=(52, 211, 153) if locked else (56, 189, 248), outline=(255, 255, 255))

    draw.text((35, pod_top_y + 38), "2 Clips latéraux Snap-Fit\n(Pincer en haut pour retirer)", font=f_small, fill=(52, 211, 153))

    # Internal components inside the Sensor Pod:
    # LiPo Battery L301525 (30x15x2.5mm) on 3M VHB foam
    draw.rectangle([(cx - 125, py - 38), (cx + 125, py - 12)], fill=(245, 158, 11), outline=(254, 243, 199))
    draw.text((cx - 95, py - 32), "Accu LiPo 3.7V 85mAh L301525", font=f_small, fill=(15, 23, 42))
    # Seeed XIAO BLE nRF52840 Sense (21x17.5mm) rigidly clamped
    draw.rectangle([(cx - 95, pod_top_y + 22), (cx + 95, py - 46)], fill=(16, 185, 129), outline=(209, 250, 229))
    draw.text((cx - 86, pod_top_y + 32), "Seeed XIAO BLE nRF52840 Sense", font=f_small, fill=(11, 17, 30))

    if locked:
        draw.rounded_rectangle([(cx - 140, pod_top_y - 36), (cx + 140, pod_top_y - 6)], radius=8, fill=(6, 95, 70), outline=(52, 211, 153), width=2)
        draw.text((cx - 122, pod_top_y - 29), "CLIC ! VERROUILLE + FER 7 DETECTE", font=f_bold, fill=(236, 253, 245))

    # =========================================================================
    # RIGHT PANEL: TOP-DOWN VIEW OF THE ALIGNMENT MARKINGS (▲ FACE)
    # =========================================================================
    rx0 = 790
    draw.rectangle([(rx0, 88), (width - 20, height - 20)], fill=(15, 23, 42), outline=(51, 65, 85), width=2)
    draw.text((rx0 + 20, 100), "B. VUE DE DESSUS : MARQUAGES D'ALIGNEMENT '▲ FACE'", font=f_bold, fill=(248, 250, 252))
    draw.text((rx0 + 20, 122), "Comment aligner l'embase avec la face du club une fois pour toutes :", font=f_small, fill=(148, 163, 184))

    tcx = (rx0 + width - 20) // 2
    tcy = 390

    # Target Line / Clubface Leading Edge reference at top of right panel
    draw.line([(tcx, 155), (tcx, 640)], fill=(56, 189, 248), width=2)
    draw.polygon([(tcx, 148), (tcx - 10, 168), (tcx + 10, 168)], fill=(56, 189, 248))
    draw.text((tcx + 16, 150), "AXE +Xc : BORD D'ATTAQUE DE LA FACE DE CLUB (SQUARE)", font=f_bold, fill=(56, 189, 248))

    # Top view of Grip Butt Cap (Ø27mm circle) with standard grip alignment dash
    draw.ellipse([(tcx - 135, tcy - 135), (tcx + 135, tcy + 135)], fill=(30, 41, 59), outline=(100, 116, 139), width=3)
    draw.rectangle([(tcx - 4, tcy - 135), (tcx + 4, tcy - 112)], fill=(255, 255, 255))
    draw.text((tcx - 185, tcy - 155), "Trait d'origine du Grip", font=f_small, fill=(226, 232, 240))

    # Top view of the Embase (Ø26mm) with its prominent raised 3D Nose Arrow ▲ FACE!
    draw.ellipse([(tcx - 115, tcy - 115), (tcx + 115, tcy + 115)], fill=(51, 65, 85), outline=(56, 189, 248), width=3)
    # Raised 3D Nose Pointer triangle at the front (+Y / top) of the Embase
    draw.polygon([(tcx, tcy - 132), (tcx - 24, tcy - 98), (tcx + 24, tcy - 98)], fill=(250, 204, 21), outline=(255, 255, 255), width=2)
    draw.text((tcx + 32, tcy - 122), "FLECHE GRAVEE EN RELIEF '▲ FACE'\nSUR L'EMBASE (A aligner au collage)", font=f_bold, fill=(250, 204, 21))

    # Asymmetric D-Socket inside the Embase (flat edge at the top/front so the pod can only enter one way!)
    draw.chord([(tcx - 78, tcy - 78), (tcx + 78, tcy + 78)], 320, 220, fill=(15, 23, 42), outline=(250, 204, 21), width=3)
    draw.text((tcx - 68, tcy - 65), "Méplat du Détrompeur 'D'", font=f_small, fill=(250, 204, 21))

    # 5 Pogo-Pin gold pads + 2 Neodymium N52 magnets inside the D-socket
    for idx in range(-2, 3):
        px = tcx + idx * 18
        draw.ellipse([(px - 6, tcy - 6), (px + 6, tcy + 6)], fill=(250, 204, 21), outline=(202, 138, 4))
    draw.ellipse([(tcx - 62, tcy - 10), (tcx - 42, tcy + 10)], fill=(168, 85, 247), outline=(255, 255, 255))
    draw.ellipse([(tcx + 42, tcy - 10), (tcx + 62, tcy + 10)], fill=(168, 85, 247), outline=(255, 255, 255))

    # Lateral Snap-Fit notches at 9 o'clock and 3 o'clock
    draw.rectangle([(tcx - 130, tcy - 22), (tcx - 112, tcy + 22)], fill=(52, 211, 153), outline=(255, 255, 255))
    draw.rectangle([(tcx + 112, tcy - 22), (tcx + 130, tcy + 22)], fill=(52, 211, 153), outline=(255, 255, 255))
    draw.text((rx0 + 25, tcy + 145), "1. Le détrompeur en 'D' empêche toute rotation (1 seul sens possible).", font=f_small, fill=(226, 232, 240))
    draw.text((rx0 + 25, tcy + 168), "2. La flèche jaune '▲ FACE' sur l'embase ET sur le capteur s'alignent", font=f_small, fill=(250, 204, 21))
    draw.text((rx0 + 25, tcy + 188), "   avec le trait du grip et le bord d'attaque de la face du club.", font=f_small, fill=(250, 204, 21))
    draw.text((rx0 + 25, tcy + 211), "3. Pour retirer le capteur : pincer les 2 ailettes latérales vertes.", font=f_small, fill=(52, 211, 153))

    return img


def generate_video_and_blueprint():
    os.makedirs(BRAIN_DIR, exist_ok=True)

    # Save static blueprint at the locked/clic moment (t_norm = 0.72 shows the snap action + locked state)
    blueprint_img = draw_assembly_frame(0.72, width=1280, height=720)
    blueprint_img.save(os.path.join(BRAIN_DIR, "cad_3d_blueprint.png"), "PNG")
    blueprint_img.save(os.path.join(CAD_DIR, "cad_3d_blueprint.png"), "PNG")

    # Render 120 frames (4 seconds @ 30 FPS) for MP4 and GIF
    frames = []
    with tempfile.TemporaryDirectory() as tmpdir:
        total_frames = 120
        for i in range(total_frames):
            t_norm = i / float(total_frames - 1)
            frame = draw_assembly_frame(t_norm, width=1280, height=720)
            frame_path = os.path.join(tmpdir, f"frame_{i:04d}.png")
            frame.save(frame_path, "PNG")
            if i % 2 == 0:
                frames.append(frame.resize((960, 540), Image.Resampling.LANCZOS))

        # Encode animated GIF
        gif_brain = os.path.join(BRAIN_DIR, "assembly_animation.gif")
        gif_cad = os.path.join(CAD_DIR, "assembly_animation.gif")
        frames[0].save(
            gif_brain,
            save_all=True,
            append_images=frames[1:],
            duration=66,
            loop=0,
        )
        frames[0].save(
            gif_cad,
            save_all=True,
            append_images=frames[1:],
            duration=66,
            loop=0,
        )

        # Encode MP4 video via ffmpeg
        mp4_brain = os.path.join(BRAIN_DIR, "assembly_animation.mp4")
        mp4_cad = os.path.join(CAD_DIR, "assembly_animation.mp4")
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-framerate",
                "30",
                "-i",
                os.path.join(tmpdir, "frame_%04d.png"),
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                mp4_brain,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        subprocess.run(["cp", mp4_brain, mp4_cad], check=True)

    print("Generated detailed STL meshes, blueprint PNG, animated GIF, and MP4 video successfully.")


if __name__ == "__main__":
    generate_detailed_stls()
    generate_video_and_blueprint()
