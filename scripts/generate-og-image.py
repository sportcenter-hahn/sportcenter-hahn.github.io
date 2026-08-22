#!/usr/bin/env python3
"""Generate the 1200×630 Open Graph share card for sportcenter-hahn.de."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "img" / "og-image.jpg"

W, H = 1200, 630

INK = (12, 19, 16)
PAPER = (242, 243, 239)
CLAY = (192, 86, 47)
TURF = (30, 140, 95)
PINE = (18, 61, 44)
MUTED = (141, 152, 145)


def font(name: str, size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    paths = [
        f"/System/Library/Fonts/Supplemental/{name}",
        f"/Library/Fonts/{name}",
        f"/System/Library/Fonts/{name}",
    ]
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_grid(base: Image.Image) -> None:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    left = 680
    for x in range(40, left, 56):
        draw.line([(x, 36), (x, H - 36)], fill=(242, 243, 239, 22), width=1)
    for y in range(36, H - 36, 56):
        draw.line([(40, y), (left, y)], fill=(242, 243, 239, 22), width=1)
    draw.rectangle([(40, 36), (left - 1, H - 37)], outline=(242, 243, 239, 38), width=1)
    base.paste(layer, (0, 0), layer)


def paste_photo(base: Image.Image) -> None:
    photo = Image.open(ROOT / "assets" / "img" / "hero.jpg").convert("RGB")
    pw, ph = photo.size
    target_w = 620
    target_h = H
    scale = max(target_w / pw, target_h / ph)
    nw, nh = int(pw * scale), int(ph * scale)
    photo = photo.resize((nw, nh), Image.Resampling.LANCZOS)
    x0 = (nw - target_w) // 2
    y0 = (nh - target_h) // 2
    photo = photo.crop((x0, y0, x0 + target_w, y0 + target_h))

    fade = Image.new("L", (target_w, H), 255)
    fade_draw = ImageDraw.Draw(fade)
    for x in range(280):
        alpha = int(255 * (1 - x / 280) ** 1.4)
        fade_draw.line([(x, 0), (x, H)], fill=alpha)
    base.paste(photo, (W - target_w, 0), fade)

    tint = Image.new("RGBA", (target_w, H), (*INK, 0))
    tint_draw = ImageDraw.Draw(tint)
    for x in range(220):
        alpha = int(120 * (1 - x / 220))
        tint_draw.line([(x, 0), (x, H)], fill=(*INK, alpha))
    base.paste(tint, (W - target_w, 0), tint)


def paste_logo(base: Image.Image) -> None:
    logo = Image.open(ROOT / "assets" / "img" / "logo-white.png").convert("RGBA")
    lw = 340
    lh = int(logo.height * (lw / logo.width))
    logo = logo.resize((lw, lh), Image.Resampling.LANCZOS)
    base.paste(logo, (64, 58), logo)


def draw_text(base: Image.Image) -> None:
    draw = ImageDraw.Draw(base)
    display = font("Impact.ttf", 74)
    body_bold = font("Arial Bold.ttf", 30)
    body = font("Arial.ttf", 24)

    draw.text((64, 250), "TENNIS · PADEL · MEHR", font=display, fill=PAPER)
    draw.text((64, 338), "Geretsried · Wolfratshausen", font=body_bold, fill=PAPER)

    draw.line([(64, 396), (420, 396)], fill=CLAY, width=3)

    draw.text((64, 418), "Platz online buchen · Training · Liga", font=body, fill=MUTED)

    sports = [
        ("Tennis", CLAY),
        ("Padel", TURF),
        ("Pickleball", PINE),
        ("Soccer Five", CLAY),
        ("Golf", TURF),
    ]
    x = 64
    y = 500
    for label, color in sports:
        draw.ellipse([(x, y + 8), (x + 10, y + 18)], fill=color)
        draw.text((x + 18, y), label, font=body, fill=PAPER)
        bbox = draw.textbbox((x + 18, y), label, font=body)
        x = bbox[2] + 28


def draw_accents(base: Image.Image) -> None:
    draw = ImageDraw.Draw(base)
    draw.rectangle([(0, H - 8), (W // 2, H)], fill=CLAY)
    draw.rectangle([(W // 2, H - 8), (W, H)], fill=TURF)

    draw.rectangle([(0, 0), (10, H)], fill=CLAY)
    draw.ellipse([(54, 154), (74, 174)], fill=CLAY)


def main() -> None:
    base = Image.new("RGB", (W, H), INK)
    draw_grid(base)
    paste_photo(base)
    paste_logo(base)
    draw_text(base)
    draw_accents(base)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    base.save(OUT, "JPEG", quality=92, optimize=True, progressive=True)
    print(f"Wrote {OUT} ({W}×{H})")


if __name__ == "__main__":
    main()
