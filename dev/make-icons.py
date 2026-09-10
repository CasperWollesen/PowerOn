"""Generate the PNG app icons from a simple vector description.

Pure Python (zlib + struct), no Pillow required. Run from the repo root:

    python dev/make-icons.py

Produces icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png
and icons/apple-touch-icon-180.png. The design mirrors icons/icon.svg.
"""

import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'icons')

# Lightning bolt polygon in a 512x512 coordinate space (same as icon.svg).
BOLT = [(292, 56), (148, 290), (250, 290), (218, 456), (372, 214), (270, 214)]
GRAD_START = (0x14, 0xB8, 0x7C)
GRAD_END = (0x0B, 0x7F, 0x5C)
WHITE = (255, 255, 255)
SUPERSAMPLE = 3


def point_in_polygon(x, y, poly):
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            x_int = (xj - xi) * (y - yi) / (yj - yi) + xi
            if x < x_int:
                inside = not inside
        j = i
    return inside


def in_rounded_rect(x, y, size, radius):
    if radius <= 0:
        return True
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2


def gradient(t):
    return tuple(int(round(GRAD_START[i] + (GRAD_END[i] - GRAD_START[i]) * t)) for i in range(3))


def render(size, maskable=False):
    """Return rows of RGBA bytes."""
    # Maskable icons must keep content inside the central 80% safe zone and fill the whole square.
    scale = size / 512.0
    bolt_scale = 0.72 if maskable else 1.0
    bolt = [((px - 256) * bolt_scale + 256, (py - 256) * bolt_scale + 256) for px, py in BOLT]
    radius = 0 if maskable else 112 * scale
    ss = SUPERSAMPLE
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = px + (sx + 0.5) / ss
                    y = py + (sy + 0.5) / ss
                    if not in_rounded_rect(x, y, size, radius):
                        continue
                    ux, uy = x / scale, y / scale
                    if point_in_polygon(ux, uy, bolt):
                        c = WHITE
                    else:
                        c = gradient((ux + uy) / 1024.0)
                    r += c[0]
                    g += c[1]
                    b += c[2]
                    a += 255
            n = ss * ss
            if a == 0:
                row += b'\x00\x00\x00\x00'
            else:
                cov = a / n
                # Un-premultiply colour over covered samples only.
                covered = a // 255
                row += bytes((r // covered, g // covered, b // covered, int(round(cov))))
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b''.join(b'\x00' + row for row in rows)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    targets = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('icon-maskable-512.png', 512, True),
        ('apple-touch-icon-180.png', 180, True),  # iOS applies its own mask; use full-bleed
    ]
    for name, size, maskable in targets:
        path = os.path.join(OUT_DIR, name)
        write_png(path, size, render(size, maskable))
        print(f'wrote {path} ({size}x{size})')


if __name__ == '__main__':
    main()
