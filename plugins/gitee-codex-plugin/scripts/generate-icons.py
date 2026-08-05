import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[1] / "assets"


def find_logo_bounds(source: Image.Image) -> tuple[int, int, int, int]:
    red_pixels = []
    for y in range(source.height):
        for x in range(source.width):
            red, green, blue, alpha = source.getpixel((x, y))
            if alpha > 0 and red > 120 and red > green * 1.6 and red > blue * 1.6:
                red_pixels.append((x, y))

    if not red_pixels:
        raise ValueError("No red circular logo was found in the source image.")

    xs, ys = zip(*red_pixels)
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    side = max(max_x - min_x + 1, max_y - min_y + 1)
    center_x = (min_x + max_x) / 2
    center_y = (min_y + max_y) / 2
    left = round(center_x - side / 2)
    top = round(center_y - side / 2)
    return left, top, left + side, top + side


def extract_icon(source_path: Path, size: int, destination: Path) -> None:
    source = Image.open(source_path).convert("RGBA")
    left, top, right, bottom = find_logo_bounds(source)
    side = right - left
    crop = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    crop.alpha_composite(source, (-left, -top))

    # The supplied screenshot has a black presentation background. Keep only the circular mark.
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, side - 1, side - 1), fill=255)
    crop.putalpha(mask)
    crop = crop.resize((size, size), Image.Resampling.LANCZOS)
    crop.save(destination, "PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract the supplied Gitee mark as plugin assets.")
    parser.add_argument("source", type=Path, help="Path to the supplied Gitee mark screenshot.")
    args = parser.parse_args()

    ASSETS.mkdir(parents=True, exist_ok=True)
    extract_icon(args.source, 128, ASSETS / "gitee-composer-icon.png")
    extract_icon(args.source, 512, ASSETS / "gitee-logo.png")
    extract_icon(args.source, 512, ASSETS / "gitee-logo-dark.png")


if __name__ == "__main__":
    main()
