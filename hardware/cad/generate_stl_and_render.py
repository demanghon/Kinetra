"""
Generates printable ASCII STL meshes for:
1. hardware/cad/geotrick_keyed_butt_cap_mount.stl (Non-destructive smooth pin + 3M VHB + D-socket)
2. hardware/cad/geotrick_sensor_pod_housing.stl (Seeed XIAO BLE nRF52840 Sense + LiPo L301525 + ESP101)
And renders a high-resolution shaded 3D isometric engineering blueprint PNG.
"""

import math
import os
from PIL import Image, ImageDraw, ImageFont

CAD_DIR = os.path.dirname(os.path.abspath(__file__))
ARTIFACT_PNG = "/home/demanghon/.gemini/antigravity-cli/brain/5493fe1c-2cb6-4f0d-bffc-2529affa62a6/cad_3d_blueprint.png"


def make_cylinder_triangles(r_bottom, r_top, z0, z1, segments=48, d_flat_y=None):
    tris = []
    pts_b = []
    pts_t = []
    for i in range(segments):
        ang = 2.0 * math.pi * i / segments
        xb, yb = r_bottom * math.cos(ang), r_bottom * math.sin(ang)
        xt, yt = r_top * math.cos(ang), r_top * math.sin(ang)
        if d_flat_y is not None:
            yb = min(yb, d_flat_y)
            yt = min(yt, d_flat_y)
        pts_b.append((xb, yb, z0))
        pts_t.append((xt, yt, z1))

    for i in range(segments):
        nxt = (i + 1) % segments
        b0, b1 = pts_b[i], pts_b[nxt]
        t0, t1 = pts_t[i], pts_t[nxt]
        tris.append((b0, b1, t1))
        tris.append((b0, t1, t0))
        tris.append(((0.0, 0.0, z0), b1, b0))
        tris.append(((0.0, 0.0, z1), t0, t1))
    return tris


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


def generate_stl_files():
    # 1. Non-Destructive Keyed Butt-Cap Mount (Ø26mm collar + Ø3.8mm smooth centering pin)
    mount_tris = []
    mount_tris.extend(make_cylinder_triangles(1.9, 1.9, -10.0, 0.0, segments=36))
    mount_tris.extend(make_cylinder_triangles(13.0, 12.0, 0.0, 6.2, segments=64))
    write_ascii_stl(
        os.path.join(CAD_DIR, "geotrick_keyed_butt_cap_mount.stl"),
        "geotrick_keyed_butt_cap_mount",
        mount_tris,
    )

    # 2. GeoTrick Sensor Pod Housing (D-plug + aerodynamic pod)
    pod_tris = []
    pod_tris.extend(make_cylinder_triangles(8.9, 8.9, -3.4, 0.0, segments=48, d_flat_y=6.9))
    pod_tris.extend(make_cylinder_triangles(16.0, 15.0, 0.0, 11.5, segments=64))
    write_ascii_stl(
        os.path.join(CAD_DIR, "geotrick_sensor_pod_housing.stl"),
        "geotrick_sensor_pod_housing",
        pod_tris,
    )


def iso_project(x, y, z, cx, cy, scale=11.0, pitch_deg=28.0, yaw_deg=-38.0):
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    x1 = x * math.cos(yaw) - y * math.sin(yaw)
    y1 = x * math.sin(yaw) + y * math.cos(yaw)
    z1 = z
    px = cx + x1 * scale
    py = cy + (y1 * math.sin(pitch) - z1 * math.cos(pitch)) * scale
    return (px, py)


def draw_cylinder_iso(draw, r_bot, r_top, z0, z1, cx, cy, scale, fill_top, fill_side, outline, d_flat_y=None, segs=64):
    top_poly = []
    bot_poly = []
    for i in range(segs):
        a = 2.0 * math.pi * i / segs
        xb, yb = r_bot * math.cos(a), r_bot * math.sin(a)
        xt, yt = r_top * math.cos(a), r_top * math.sin(a)
        if d_flat_y is not None:
            yb = min(yb, d_flat_y)
            yt = min(yt, d_flat_y)
        bot_poly.append(iso_project(xb, yb, z0, cx, cy, scale))
        top_poly.append(iso_project(xt, yt, z1, cx, cy, scale))

    # Draw side quads for front-facing segments
    for i in range(segs):
        nxt = (i + 1) % segs
        quad = [bot_poly[i], bot_poly[nxt], top_poly[nxt], top_poly[i]]
        draw.polygon(quad, fill=fill_side)

    draw.polygon(bot_poly, outline=outline)
    draw.polygon(top_poly, fill=fill_top, outline=outline)


def draw_box_iso(draw, lx, ly, z0, z1, cx, cy, scale, fill_top, fill_front, fill_right, outline):
    hx, hy = lx / 2.0, ly / 2.0
    c_bot = [
        iso_project(-hx, -hy, z0, cx, cy, scale),
        iso_project(hx, -hy, z0, cx, cy, scale),
        iso_project(hx, hy, z0, cx, cy, scale),
        iso_project(-hx, hy, z0, cx, cy, scale),
    ]
    c_top = [
        iso_project(-hx, -hy, z1, cx, cy, scale),
        iso_project(hx, -hy, z1, cx, cy, scale),
        iso_project(hx, hy, z1, cx, cy, scale),
        iso_project(-hx, hy, z1, cx, cy, scale),
    ]
    # Front/left & front/right faces
    draw.polygon([c_bot[1], c_bot[2], c_top[2], c_top[1]], fill=fill_right, outline=outline)
    draw.polygon([c_bot[2], c_bot[3], c_top[3], c_top[2]], fill=fill_front, outline=outline)
    draw.polygon([c_bot[0], c_bot[1], c_top[1], c_top[0]], fill=fill_front, outline=outline)
    draw.polygon(c_top, fill=fill_top, outline=outline)


def render_blueprint_png():
    W, H = 1600, 1000
    img = Image.new("RGB", (W, H), (13, 19, 30))
    draw = ImageDraw.Draw(img)

    # Subtle engineering grid
    for gx in range(0, W, 40):
        draw.line([(gx, 0), (gx, H)], fill=(22, 32, 48), width=1)
    for gy in range(0, H, 40):
        draw.line([(0, gy), (W, gy)], fill=(22, 32, 48), width=1)

    # Title banner
    draw.rectangle([(30, 24), (W - 30, 96)], fill=(20, 30, 46), outline=(56, 189, 248), width=2)
    draw.text(
        (55, 40),
        "KINETRA - MODELISATION CAO 3D : BOITIER CAPTEUR XIAO BLE & EMBASE MAGNETIQUE NON-DESTRUCTIVE",
        fill=(240, 249, 255),
    )
    draw.text(
        (55, 66),
        "Vue eclatee & Assemblage (Echelle metrique : Carte XIAO 21x17.5mm | LiPo L301525 30x15x2.5mm | Embase D=26mm + Pion lisse D=3.8mm + 3M VHB)",
        fill=(148, 163, 184),
    )

    # --- LEFT PANEL: EXPLODED VIEW OF EMBASE + SENSOR POD ---
    cx_left = 460
    cy_left = 760
    scale = 11.5

    # 1. Golf Grip Top Reference
    draw_cylinder_iso(
        draw, 13.5, 13.0, -22.0, -8.0, cx_left, cy_left, scale,
        fill_top=(45, 55, 72), fill_side=(30, 41, 59), outline=(100, 116, 139)
    )
    draw.text((cx_left - 280, cy_left + 120), "1. Sommet du Grip (Trou d'event d'origine D=3.8mm)", fill=(148, 163, 184))

    # 2. Smooth Centering Pin + 3M VHB Adhesive Pad (Green/Red)
    draw_cylinder_iso(
        draw, 1.9, 1.9, -4.0, 4.0, cx_left, cy_left, scale,
        fill_top=(56, 189, 248), fill_side=(14, 116, 144), outline=(125, 211, 252)
    )
    draw_cylinder_iso(
        draw, 12.5, 12.5, 4.0, 4.8, cx_left, cy_left, scale,
        fill_top=(239, 68, 68), fill_side=(185, 28, 28), outline=(252, 165, 165)
    )
    draw.text((cx_left + 155, cy_left - 45), "2. Rondelle 3M VHB D=25mm (0.5mm) + Pion lisse D=3.8mm (Zero vis / Zero picot)", fill=(252, 165, 165))

    # 3. Keyed Magnetic Butt-Cap Mount (D=26mm, D-socket + 5 gold pogo pads)
    draw_cylinder_iso(
        draw, 13.0, 12.0, 10.0, 16.2, cx_left, cy_left, scale,
        fill_top=(51, 65, 85), fill_side=(30, 41, 59), outline=(56, 189, 248)
    )
    # Inner D-socket cavity on top of mount
    draw_cylinder_iso(
        draw, 9.0, 9.0, 15.8, 16.3, cx_left, cy_left, scale,
        fill_top=(15, 23, 42), fill_side=(15, 23, 42), outline=(250, 204, 21), d_flat_y=7.0
    )
    # 5 gold Pogo-Pin target pads inside the D-socket
    for idx in range(-2, 3):
        px, py = iso_project(idx * 2.2, 0.0, 16.3, cx_left, cy_left, scale)
        draw.ellipse([(px - 4, py - 3), (px + 4, py + 3)], fill=(250, 204, 21), outline=(202, 138, 4))
    draw.text((cx_left + 155, cy_left - 175), "3. Embase Club (D=26mm, Puits en 'D' detrompe + 5 pastilles Pogo-Pin Or + Ponts D0..D3)", fill=(250, 204, 21))

    # 4. Sensor Pod Base + Male D-Plug
    draw_cylinder_iso(
        draw, 8.9, 8.9, 23.0, 26.4, cx_left, cy_left, scale,
        fill_top=(71, 85, 105), fill_side=(51, 65, 85), outline=(148, 163, 184), d_flat_y=6.9
    )

    # 5. LiPo Battery L301525 (30 x 15 x 2.5mm)
    draw_box_iso(
        draw, 26.0, 15.0, 29.0, 31.5, cx_left, cy_left, scale,
        fill_top=(245, 158, 11), fill_front=(217, 119, 6), fill_right=(180, 83, 9), outline=(254, 243, 199)
    )
    draw.text((cx_left + 155, cy_left - 355), "4. Accu LiPo 3.7V 85mAh L301525 (30x15x2.5mm) sur mousse amortissante VHB", fill=(253, 224, 71))

    # 6. Seeed XIAO BLE nRF52840 Sense (21 x 17.5 x 3.5mm) + ESP101 Switch
    draw_box_iso(
        draw, 21.0, 17.5, 36.0, 39.0, cx_left, cy_left, scale,
        fill_top=(16, 185, 129), fill_front=(5, 150, 105), fill_right=(4, 120, 87), outline=(167, 243, 208)
    )
    draw.text((cx_left + 155, cy_left - 445), "5. Carte Seeed XIAO BLE nRF52840 Sense (LSM6DS3 6-DoF + Micro PDM + USB-C)", fill=(110, 231, 183))

    # 7. Top Aerodynamic Cap (PETG-CF / Nylon PA12)
    draw_cylinder_iso(
        draw, 16.0, 14.5, 44.0, 51.0, cx_left, cy_left, scale,
        fill_top=(30, 41, 59), fill_side=(15, 23, 42), outline=(56, 189, 248)
    )
    draw.text((cx_left + 155, cy_left - 555), "6. Capot Superieur Boitier (D=32x11.5mm, PETG-CF, Inter ESP101 encastre 1.2mm)", fill=(56, 189, 248))

    # Dashed vertical alignment axis
    for z_step in range(-8, 45, 2):
        p_a = iso_project(0, 0, z_step, cx_left, cy_left, scale)
        p_b = iso_project(0, 0, z_step + 1, cx_left, cy_left, scale)
        draw.line([p_a, p_b], fill=(56, 189, 248), width=2)

    # --- RIGHT PANEL: CROSS-SECTION & 4-BIT GPIO AUTO-ID WIRING DIAGRAM ---
    rx0, ry0 = 980, 520
    draw.rectangle([(rx0, ry0), (W - 40, H - 35)], fill=(18, 27, 42), outline=(71, 85, 105), width=2)
    draw.text((rx0 + 25, ry0 + 20), "SCHEMA DU CONNECTEUR MAGNETIQUE POGO-PIN 5 BROCHES & CODAGE 4-BITS", fill=(56, 189, 248))
    draw.text((rx0 + 25, ry0 + 48), "Chaque embase ponte un code binaire unique vers GND avec votre fil souple 0.20mm2 :", fill=(203, 213, 225))

    pins = ["D3 (Bit 3)", "D2 (Bit 2)", "D1 (Bit 1)", "D0 (Bit 0)", "GND (Masse)"]
    for i, label in enumerate(pins):
        px = rx0 + 60 + i * 105
        py = ry0 + 115
        color = (239, 68, 68) if i == 4 else (250, 204, 21)
        draw.ellipse([(px - 22, py - 22), (px + 22, py + 22)], fill=color, outline=(255, 255, 255), width=2)
        draw.text((px - 32, py + 30), label, fill=(226, 232, 240))

    table_rows = [
        ("Embase #1 (Driver 1W)", "Code GPIO = 1110", "Pont fil 0.20mm2 : D0 <---> GND"),
        ("Embase #2 (Bois 3W)",   "Code GPIO = 1101", "Pont fil 0.20mm2 : D1 <---> GND"),
        ("Embase #4 (Fer 5I)",    "Code GPIO = 1011", "Pont fil 0.20mm2 : D2 <---> GND"),
        ("Embase #7 (Fer 7I)",    "Code GPIO = 1000", "Pont fil 0.20mm2 : D2 + D1 + D0 <---> GND"),
        ("Embase #14 (Putter)",   "Code GPIO = 0001", "Pont fil 0.20mm2 : D3 + D2 + D1 <---> GND"),
        ("Capteur Declipse",      "Code GPIO = 1111", "Aucun pont -> Coupe le BLE (Deep Sleep 15uA)"),
    ]
    for r_idx, (club, code, wiring) in enumerate(table_rows):
        ty = ry0 + 195 + r_idx * 38
        draw.rectangle([(rx0 + 25, ty), (W - 65, ty + 32)], fill=(30, 41, 59))
        draw.text((rx0 + 35, ty + 8), f"{club:24s} | {code:17s} | {wiring}", fill=(167, 243, 208) if r_idx < 5 else (252, 165, 165))

    os.makedirs(os.path.dirname(ARTIFACT_PNG), exist_ok=True)
    img.save(ARTIFACT_PNG, "PNG")
    img.save(os.path.join(CAD_DIR, "cad_3d_blueprint.png"), "PNG")
    print("Generated STL meshes and 3D blueprint PNG successfully.")


if __name__ == "__main__":
    generate_stl_files()
    render_blueprint_png()
