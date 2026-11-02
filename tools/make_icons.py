#!/usr/bin/env python3
"""Regenerate Seclusa Notes icons (black mark on white — Seclusa B&W).

    python3 tools/make_icons.py

Needs Pillow. Drawn at 1024 then downscaled. Outputs land in the app root
where the manifest and service worker already look for them.
"""

from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

SIZE = 1024
BG = (255, 255, 255, 255)
FG = (10, 10, 10, 255)


def draw_mark(size, colour=FG):
    """A note sheet with a folded corner and ruled lines — not a calendar."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)

    # Page body (inset so maskable crops keep the mark).
    left = int(size * 0.22)
    top = int(size * 0.16)
    right = int(size * 0.78)
    bottom = int(size * 0.84)
    fold = int(size * 0.16)
    radius = int(size * 0.04)

    # Main page, cut away for the fold triangle in the top-right.
    page = [
        (left + radius, top),
        (right - fold, top),
        (right, top + fold),
        (right, bottom - radius),
        (right - radius, bottom),
        (left + radius, bottom),
        (left, bottom - radius),
        (left, top + radius),
    ]
    d.polygon(page, fill=colour)

    # Soften the outer corners a little by redrawing rounded ends.
    d.pieslice([left, top, left + 2 * radius, top + 2 * radius], 180, 270, fill=colour)
    d.pieslice(
        [left, bottom - 2 * radius, left + 2 * radius, bottom], 90, 180, fill=colour
    )
    d.pieslice(
        [right - 2 * radius, bottom - 2 * radius, right, bottom], 0, 90, fill=colour
    )

    # Folded corner: leave a white triangle, then a dark flap edge.
    d.polygon(
        [(right - fold, top), (right, top + fold), (right - fold, top + fold)],
        fill=BG,
    )
    # Flap face (slightly inset so it reads as a fold, not a hole).
    inset = max(2, size // 128)
    d.polygon(
        [
            (right - fold + inset, top + inset),
            (right - inset, top + fold - inset),
            (right - fold + inset, top + fold - inset),
        ],
        fill=colour,
    )

    # Ruled lines on the page (cut through the fill by painting BG lines).
    line_left = left + int(size * 0.10)
    line_right = right - int(size * 0.10)
    stroke = max(3, size // 48)
    for y_frac in (0.42, 0.54, 0.66):
        y = int(size * y_frac)
        d.line([(line_left, y), (line_right, y)], fill=BG, width=stroke)

    return layer


def make_any(size):
    out = Image.new("RGBA", (size, size), BG)
    mark = draw_mark(size)
    out.paste(mark, (0, 0), mark)
    # Clip to a rounded square so it matches other Seclusa launcher tiles.
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * 0.18), fill=255
    )
    rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rounded.paste(out, (0, 0))
    rounded.putalpha(mask)
    # Put the rounded tile back on white so PNG viewers see a solid field.
    final = Image.new("RGBA", (size, size), BG)
    final.paste(rounded, (0, 0), rounded)
    return final


def make_maskable(size):
    """Full-bleed white field; mark inset so Android shape masks keep it."""
    out = Image.new("RGBA", (size, size), BG)
    inner = int(size * 0.72)
    mark = draw_mark(inner)
    off = (size - inner) // 2
    out.paste(mark, (off, off), mark)
    return out


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Seclusa Notes">
  <rect width="1024" height="1024" rx="184" fill="#ffffff"/>
  <path fill="#0a0a0a" d="M225 164h410l164 164v532c0 22-18 40-40 40H265c-22 0-40-18-40-40V204c0-22 18-40 40-40z"/>
  <path fill="#ffffff" d="M635 164l164 164H675c-22 0-40-18-40-40V164z"/>
  <path fill="#0a0a0a" d="M647 176l140 140H687c-11 0-20-9-20-20V176z"/>
  <rect x="320" y="430" width="384" height="36" rx="8" fill="#ffffff"/>
  <rect x="320" y="553" width="384" height="36" rx="8" fill="#ffffff"/>
  <rect x="320" y="676" width="384" height="36" rx="8" fill="#ffffff"/>
</svg>
"""

SVG_MASKABLE = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Seclusa Notes">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <g transform="translate(144 144) scale(0.72)">
    <path fill="#0a0a0a" d="M225 164h410l164 164v532c0 22-18 40-40 40H265c-22 0-40-18-40-40V204c0-22 18-40 40-40z"/>
    <path fill="#ffffff" d="M635 164l164 164H675c-22 0-40-18-40-40V164z"/>
    <path fill="#0a0a0a" d="M647 176l140 140H687c-11 0-20-9-20-20V176z"/>
    <rect x="320" y="430" width="384" height="36" rx="8" fill="#ffffff"/>
    <rect x="320" y="553" width="384" height="36" rx="8" fill="#ffffff"/>
    <rect x="320" y="676" width="384" height="36" rx="8" fill="#ffffff"/>
  </g>
</svg>
"""


def main():
    for size in (192, 512):
        make_any(size).save(ROOT / f"icon-{size}.png")
    make_maskable(512).save(ROOT / "icon-maskable-512.png")
    (ROOT / "icon.svg").write_text(SVG, encoding="utf-8")
    (ROOT / "icon-maskable.svg").write_text(SVG_MASKABLE, encoding="utf-8")
    for name in (
        "icon-192.png",
        "icon-512.png",
        "icon-maskable-512.png",
        "icon.svg",
        "icon-maskable.svg",
    ):
        print(name)


if __name__ == "__main__":
    main()
