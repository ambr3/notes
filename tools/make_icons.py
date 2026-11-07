#!/usr/bin/env python3
"""Regenerate Seclusa Notes icons (black pencil on a white tile).

    python3 tools/make_icons.py

Writes the SVG icons, then rasterizes them with ImageMagick.
The maskable mark is scaled to sit inside the center 80% safe zone.
"""

import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# Classic pencil: eraser, ferrule, body, wood tip, graphite point.
MARK = """  <g transform="translate(512 512) rotate(-40)" fill="#0a0a0a">
    <rect x="-52" y="-420" width="104" height="88" rx="22"/>
    <rect x="-56" y="-332" width="112" height="70" rx="8"/>
    <rect x="-48" y="-318" width="96" height="14" fill="#ffffff"/>
    <rect x="-48" y="-292" width="96" height="14" fill="#ffffff"/>
    <rect x="-52" y="-262" width="104" height="430"/>
    <path d="M-52 160 L0 390 L52 160 Z"/>
  </g>
"""

SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Seclusa Notes">
  <rect width="1024" height="1024" rx="200" fill="#ffffff"/>
{MARK}</svg>
"""

SVG_MASKABLE = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" role="img" aria-label="Seclusa Notes">
  <rect width="1024" height="1024" fill="#ffffff"/>
  <g transform="translate(512 512) scale(0.86) translate(-512 -512)">
{MARK}  </g>
</svg>
"""


def raster(svg_path, png_path, size):
    magick = shutil.which("magick")
    if not magick:
        raise SystemExit("ImageMagick (magick) is required to rasterize the icons.")
    subprocess.run(
        [
            magick,
            "-background", "none",
            "-density", "384",
            str(svg_path),
            "-resize", f"{size}x{size}",
            f"PNG32:{png_path}",
        ],
        check=True,
    )


def main():
    any_svg = ROOT / "icon.svg"
    mask_svg = ROOT / "icon-maskable.svg"
    any_svg.write_text(SVG, encoding="utf-8")
    mask_svg.write_text(SVG_MASKABLE, encoding="utf-8")
    raster(any_svg, ROOT / "icon-512.png", 512)
    raster(any_svg, ROOT / "icon-192.png", 192)
    raster(mask_svg, ROOT / "icon-maskable-512.png", 512)
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
