#!/usr/bin/env python3
"""Regenerate Seclusa Notes icons (black line mark on a white tile).

    python3 tools/make_icons.py

Writes the SVG icons, then rasterizes them with ImageMagick.
The maskable mark is scaled to sit inside the center 80% safe zone.
"""

import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

MARK = """  <path fill="none" stroke="#0a0a0a" stroke-width="36" stroke-linejoin="round" stroke-linecap="round" d="M268 180H624L804 360V812a48 48 0 0 1-48 48H268a48 48 0 0 1-48-48V228a48 48 0 0 1 48-48z"/>
  <path fill="none" stroke="#0a0a0a" stroke-width="36" stroke-linejoin="round" stroke-linecap="round" d="M624 180V312a48 48 0 0 0 48 48H804"/>
  <path fill="none" stroke="#0a0a0a" stroke-width="28" stroke-linecap="round" d="M300 500H720"/>
  <path fill="none" stroke="#0a0a0a" stroke-width="28" stroke-linecap="round" d="M300 620H720"/>
  <path fill="none" stroke="#0a0a0a" stroke-width="28" stroke-linecap="round" d="M300 740H560"/>
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
