#!/usr/bin/env python3
"""Builds every derived brand image from the two masters in this folder.

Inputs (never modified by a normal build):
  logo-full.png   the full logo with the "DAUNTLESS REVIVED" wordmark
  emblem.png      the dragon-head emblem
  palette.json    the eight brand colours and the checked contrast pairs

Outputs: web/, icons/, launcher/, social-preview.png, og.png, ../.github/assets/banner.png and
copies of the docs site's images in ../docs/assets/ (see README.md for what goes where).

Needs Python 3.10+, Pillow 9.1+ with WebP support (and libimagequant for the 256-colour web PNGs),
rsvg-convert and the Inter and JetBrains Mono fonts.
On Debian or Ubuntu (WSL works): apt install python3-pil librsvg2-bin fonts-inter fonts-jetbrains-mono

  python3 brand/build.py                  rebuild everything
  python3 brand/build.py --check          only check: the contrast ratios in palette.json, the docs
                                          site's colour tokens and theme colour against palette.json,
                                          and its image copies against the files here
  python3 brand/build.py --import-masters FULL.png EMBLEM.png
                                          copy new artwork in as the masters (pixels kept exactly,
                                          metadata chunks dropped), then rebuild
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import re
import shutil
import struct
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageFilter, features

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
PALETTE = json.loads((HERE / "palette.json").read_text(encoding="utf-8"))
C = {name: spec["hex"] for name, spec in PALETTE["colors"].items()}

LOGO_W, LOGO_H = 1402, 1122  # master size; derived sizes keep this aspect ratio


# ------------------------------------------------------------------ contrast


def _lin(v: int) -> float:
    c = v / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_colour: str) -> float:
    n = int(hex_colour.lstrip("#"), 16)
    r, g, b = n >> 16, (n >> 8) & 255, n & 255
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(fg: str, bg: str) -> float:
    a, b = luminance(C.get(fg, fg)), luminance(C.get(bg, bg))
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def check_contrast() -> bool:
    ok = True
    for spec in PALETTE["colors"].values():
        n = int(spec["hex"][1:], 16)
        if spec["rgb"] != [n >> 16, (n >> 8) & 255, n & 255]:
            print(f"palette.json: rgb does not match hex for {spec['hex']}")
            ok = False
    print(f"{'fg':6} {'bg':6} {'ratio':>6}  need  use")
    for p in PALETTE["contrast"]["pairs"]:
        r = contrast(p["fg"], p["bg"])
        need = 4.5 if p["kind"] == "text" else 3.0
        flag = "ok" if r >= need else "FAIL"
        if r < need or abs(round(r, 2) - p["ratio"]) > 0.005:
            ok = False
            flag += f" (recorded {p['ratio']})" if abs(round(r, 2) - p["ratio"]) > 0.005 else ""
        print(f"{p['fg']:6} {p['bg']:6} {r:6.2f}  {need:>4}  {p['use']}  [{flag}]")
    for p in PALETTE["contrast"]["avoid"]:
        r = contrast(p["fg"], p["bg"])
        if abs(round(r, 2) - p["ratio"]) > 0.005:
            print(f"avoid list: {p['fg']} on {p['bg']} is {r:.2f}, recorded {p['ratio']}")
            ok = False
    return ok


# ------------------------------------------------------------------ docs site

# The docs site (GitHub Pages serves only docs/) keeps copies of these files: source here -> copy.
DOCS_COPIES = {
    "icons/favicon.ico": "docs/assets/favicon.ico",
    "icons/icon-192.png": "docs/assets/icon-192.png",
    "icons/apple-touch-icon.png": "docs/assets/apple-touch-icon.png",
    "og.png": "docs/assets/og-revived.png",  # a new name when the image changes: link previews cache by URL
    "web/emblem-128.png": "docs/assets/brand/emblem-128.png",
    "web/logo-400.png": "docs/assets/brand/logo-400.png",
    "web/logo-400.webp": "docs/assets/brand/logo-400.webp",
    "web/logo-800.png": "docs/assets/brand/logo-800.png",
    "web/logo-800.webp": "docs/assets/brand/logo-800.webp",
}
DOCS_TOKENS = ROOT / "docs/_sass/custom/setup.scss"
DOCS_HEAD = ROOT / "docs/_includes/head_custom.html"


def copy_docs_assets() -> list[Path]:
    out = []
    for src, dest in DOCS_COPIES.items():
        target = ROOT / dest
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(HERE / src, target)
        out.append(target)
    return out


def check_docs() -> bool:
    """The docs site's tokens ($dr-ink ...) and <meta name="theme-color"> must equal palette.json, and
    its image copies must be byte for byte the files built here."""
    ok = True
    tokens = {m[1]: m[2].upper() for m in re.finditer(r"^\$dr-([a-z]+):\s*(#[0-9A-Fa-f]{6})\s*;", DOCS_TOKENS.read_text(encoding="utf-8"), re.M)}
    wanted = {name: hex_.upper() for name, hex_ in C.items()}
    if tokens != wanted:
        print(f"{DOCS_TOKENS.relative_to(ROOT).as_posix()}: tokens {tokens} differ from palette.json {wanted}")
        ok = False
    theme = re.findall(r'<meta name="theme-color" content="(#[0-9A-Fa-f]{6})">', DOCS_HEAD.read_text(encoding="utf-8"))
    if [t.upper() for t in theme] != [wanted["ink"]]:
        print(f"{DOCS_HEAD.relative_to(ROOT).as_posix()}: theme-color {theme} is not ink {wanted['ink']}")
        ok = False
    for src, dest in DOCS_COPIES.items():
        target = ROOT / dest
        if not target.is_file() or target.read_bytes() != (HERE / src).read_bytes():
            print(f"{dest}: missing or not a copy of brand/{src}; run python3 brand/build.py")
            ok = False
    if ok:
        print(f"docs site: 8 tokens and the theme colour match palette.json, {len(DOCS_COPIES)} image copies are current")
    return ok


# ------------------------------------------------------------------ image helpers


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def save_png_web(img: Image.Image, path: Path) -> None:
    """Web copies: 256-colour palette PNG with alpha (libimagequant, dithered). About a third of
    the lossless size and not visibly different; falls back to lossless when libimagequant is
    missing. Masters and launcher icons are always lossless."""
    if not features.check("libimagequant"):
        return save_png(img, path)
    path.parent.mkdir(parents=True, exist_ok=True)
    q = img.quantize(colors=256, method=Image.Quantize.LIBIMAGEQUANT, dither=Image.Dither.FLOYDSTEINBERG)
    q.save(path, "PNG", optimize=True)


def save_webp(img: Image.Image, path: Path) -> None:
    """Lossy WebP with a near-lossless alpha plane; checked by eye at 2x zoom against the PNG."""
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=82, alpha_quality=90, method=6)


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def shrink(img: Image.Image, w: int, h: int) -> Image.Image:
    """High-quality downscale: halve with a box filter while far above the target, then Lanczos.
    Pillow premultiplies alpha for RGBA resampling, so edges do not pick up dark fringes."""
    cur = img
    while cur.width >= w * 4 and cur.height >= h * 4:
        cur = cur.resize((cur.width // 2, cur.height // 2), Image.Resampling.BOX)
    return cur.resize((w, h), Image.Resampling.LANCZOS)


def logo_at(width: int) -> Image.Image:
    return shrink(LOGO, width, round(width * LOGO_H / LOGO_W))


def emblem_square(pad: float = 0.02) -> Image.Image:
    """The emblem cropped to its visible pixels and centred on a square canvas."""
    alpha = EMBLEM.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    x0, y0, x1, y1 = alpha.getbbox()
    w, h = x1 - x0, y1 - y0
    side = round(max(w, h) * (1 + 2 * pad))
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(EMBLEM.crop((x0, y0, x1, y1)), ((side - w) // 2, (side - h) // 2))
    return sq


def harden_alpha(img: Image.Image, lo: int, hi: int) -> Image.Image:
    """Maps alpha lo..hi to 0..255: faint anti-aliasing from the thin spikes drops out and the
    silhouette edge becomes decisive. Colour channels are untouched."""
    lut = [0 if v <= lo else 255 if v >= hi else round((v - lo) * 255 / (hi - lo)) for v in range(256)]
    r, g, b, a = img.split()
    return Image.merge("RGBA", (r, g, b, a.point(lut)))


def sharpen_rgb(img: Image.Image, percent: int) -> Image.Image:
    rgb = img.convert("RGB").filter(ImageFilter.UnsharpMask(radius=0.6, percent=percent, threshold=0))
    return Image.merge("RGBA", (*rgb.split(), img.getchannel("A")))


def emblem_at(size: int) -> Image.Image:
    """The emblem at an exact square size. At 48 px and below the art is only resampled, never
    redrawn: a light unsharp mask keeps the white skull and the cyan eye apart, and the alpha
    curve keeps the outline crisp instead of a soft halo."""
    img = shrink(EMBLEM_SQ, size, size)
    if size <= 32:
        return harden_alpha(sharpen_rgb(img, 120), 64, 192)
    if size <= 48:
        return harden_alpha(sharpen_rgb(img, 60), 32, 224)
    return img


def ico(images: list[Image.Image]) -> bytes:
    """ICO with a PNG-compressed entry per size (Windows Vista and later, every current browser)."""
    blobs = [(im.width, png_bytes(im)) for im in images]
    header = struct.pack("<HHH", 0, 1, len(blobs))
    entries, offset = b"", 6 + 16 * len(blobs)
    for size, data in blobs:
        dim = 0 if size >= 256 else size
        entries += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    return header + entries + b"".join(d for _, d in blobs)


def data_uri(img: Image.Image) -> str:
    return "data:image/png;base64," + base64.b64encode(png_bytes(img)).decode("ascii")


def render_svg(svg: str, width: int, height: int) -> Image.Image:
    out = subprocess.run(
        ["rsvg-convert", "--width", str(width), "--height", str(height), "--format", "png"],
        input=svg.encode("utf-8"),
        capture_output=True,
        check=True,
    ).stdout
    return Image.open(io.BytesIO(out)).convert("RGBA")


# ------------------------------------------------------------------ compositions

SANS = "Inter, 'Segoe UI', Arial, sans-serif"
MONO = "'JetBrains Mono', Consolas, monospace"


def backdrop(w: int, h: int, glow_cx: float, glow_cy: float, glow_r: float) -> str:
    """Shared background: ink to navy, an azure and ice glow behind the logo, a faint grid."""
    return f"""
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{C['ink']}"/>
      <stop offset="1" stop-color="{C['navy']}"/>
    </linearGradient>
    <radialGradient id="halo" cx="{glow_cx}" cy="{glow_cy}" r="{glow_r}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{C['azure']}" stop-opacity="0.55"/>
      <stop offset="0.45" stop-color="{C['deep']}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="{C['deep']}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="core" cx="{glow_cx}" cy="{glow_cy}" r="{glow_r * 0.45}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="{C['ice']}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="{C['ice']}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="{C['glow']}" stroke-opacity="0.035"/>
    </pattern>
  </defs>
  <rect width="{w}" height="{h}" fill="url(#bg)"/>
  <rect width="{w}" height="{h}" fill="url(#grid)"/>
  <rect width="{w}" height="{h}" fill="url(#halo)"/>
  <rect width="{w}" height="{h}" fill="url(#core)"/>"""


def banner() -> Image.Image:
    """README banner: 1280x320 layout rendered at 2x (2560x640), the size of the banner it replaces."""
    scale = 2
    lw = 350
    lh = round(lw * LOGO_H / LOGO_W)
    lx, ly = 44, (320 - lh) // 2
    logo = logo_at(lw * scale)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="320" viewBox="0 0 1280 320">
  {backdrop(1280, 320, lx + lw / 2, 160, 300)}
  <rect x="0" y="316" width="1280" height="4" fill="{C['ice']}" fill-opacity="0.9"/>
  <rect x="0" y="316" width="1280" height="1" fill="{C['glow']}" fill-opacity="0.6"/>
  <image x="{lx}" y="{ly}" width="{lw}" height="{lh}" href="{data_uri(logo)}"/>
  <rect x="{BANNER_TX - 32}" y="58" width="2" height="196" fill="{C['deep']}"/>
  {BANNER_TEXT}
</svg>"""
    return render_svg(svg, 1280 * scale, 320 * scale).convert("RGB")


# The banner's text column, kept apart so a contrast check can render the backdrop without it.
BANNER_TX = 452
BANNER_TEXT = f"""<text x="{BANNER_TX}" y="78" font-family="{MONO}" font-size="15" font-weight="600" letter-spacing="4" fill="{C['glow']}">PRIVATE SERVER REVIVAL · DAUNTLESS 1.4.4</text>
  <text x="{BANNER_TX - 3}" y="138" font-family="{SANS}" font-size="58" font-weight="800" fill="{C['frost']}">Dauntless Revived</text>
  <text x="{BANNER_TX}" y="182" font-family="{SANS}" font-size="24" fill="{C['frost']}">Play the genuine Dauntless 1.4.4 client on a server</text>
  <text x="{BANNER_TX}" y="212" font-family="{SANS}" font-size="24" fill="{C['frost']}">you host yourself.</text>
  <text x="{BANNER_TX}" y="251" font-family="{MONO}" font-size="15" fill="{C['steel']}">fork of Undaunted by gwog &amp; contributors · AGPL-3.0</text>
  <text x="{BANNER_TX}" y="274" font-family="{MONO}" font-size="15" fill="{C['steel']}">unofficial fan project, not affiliated with Phoenix Labs</text>"""


def card(w: int, h: int, logo_h: int, text_size: int) -> Image.Image:
    """Social preview: the logo centred with one line of text under it, inside safe margins."""
    lw = round(logo_h * LOGO_W / LOGO_H)
    gap = round(text_size * 1.1)
    block = logo_h + gap + text_size
    ly = (h - block) // 2
    lx = (w - lw) // 2
    base = ly + logo_h + gap + round(text_size * 0.78)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  {backdrop(w, h, w / 2, ly + logo_h * 0.42, h * 0.62)}
  <rect x="0" y="{h - 6}" width="{w}" height="6" fill="{C['ice']}" fill-opacity="0.9"/>
  <image x="{lx}" y="{ly}" width="{lw}" height="{logo_h}" href="{data_uri(logo_at(lw))}"/>
  <text x="{w / 2}" y="{base}" text-anchor="middle" font-family="{SANS}" font-size="{text_size}" font-weight="600" fill="{C['frost']}">Private server revival of Dauntless 1.4.4</text>
</svg>"""
    return render_svg(svg, w, h).convert("RGB")


def apple_touch(size: int = 180) -> Image.Image:
    """iOS draws transparent pixels black and rounds the corners itself, so this one is opaque."""
    inner = round(size * 0.8)
    off = (size - inner) / 2
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{C['navy']}"/>
      <stop offset="1" stop-color="{C['ink']}"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.45" r="0.55">
      <stop offset="0" stop-color="{C['azure']}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="{C['azure']}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="{size}" height="{size}" fill="url(#bg)"/>
  <rect width="{size}" height="{size}" fill="url(#halo)"/>
  <image x="{off}" y="{off}" width="{inner}" height="{inner}" href="{data_uri(emblem_at(inner))}"/>
</svg>"""
    return render_svg(svg, size, size).convert("RGB")


# ------------------------------------------------------------------ build


def import_masters(full: Path, emblem: Path) -> None:
    for src, name in ((full, "logo-full.png"), (emblem, "emblem.png")):
        img = Image.open(src)
        img.load()
        rgba = img.convert("RGBA")
        dest = HERE / name
        save_png(rgba, dest)  # Pillow writes only IHDR, IDAT and IEND here
        again = Image.open(dest).convert("RGBA")
        if again.tobytes() != rgba.tobytes():
            sys.exit(f"{dest}: re-encoded pixels differ from {src}")
        print(f"{name}: {img.width}x{img.height}, {src.stat().st_size} -> {dest.stat().st_size} bytes, pixels identical")


def build() -> None:
    out = []

    def put(img: Image.Image, rel: str, webp: bool = False, web: bool = False) -> None:
        path = HERE / rel
        (save_png_web if web else save_png)(img, path)
        out.append(path)
        if webp:
            save_webp(img, path.with_suffix(".webp"))
            out.append(path.with_suffix(".webp"))

    # Web versions of the full logo (width in the name).
    for w in (1200, 800, 400):
        put(logo_at(w), f"web/logo-{w}.png", webp=True, web=True)

    # Web versions of the emblem (square). The small ones stay lossless: they are tiny anyway.
    for s in (512, 256, 128, 64, 32, 16):
        put(emblem_at(s), f"web/emblem-{s}.png", webp=s >= 128, web=s >= 128)

    # Site icons.
    fav = HERE / "icons/favicon.ico"
    fav.parent.mkdir(parents=True, exist_ok=True)
    fav.write_bytes(ico([emblem_at(s) for s in (16, 32, 48)]))
    out.append(fav)
    put(apple_touch(180), "icons/apple-touch-icon.png")
    put(emblem_at(192), "icons/icon-192.png", web=True)
    put(emblem_at(512), "icons/icon-512.png", web=True)

    # The launcher's set. UndauntedLauncher's `npm run icon` copies these (and web/emblem-32, -64
    # and -512) into the launcher; this script does not write there.
    app = HERE / "launcher/icon.ico"
    app.parent.mkdir(parents=True, exist_ok=True)
    app.write_bytes(ico([emblem_at(s) for s in (16, 24, 32, 48, 64, 128, 256)]))
    out.append(app)
    for s in (256, 512, 1024):
        put(emblem_at(s), f"launcher/icon-{s}.png")
    put(logo_at(320), "launcher/logo-inapp.png")
    put(logo_at(640), "launcher/logo-inapp@2x.png")

    # Banner, social preview (GitHub, 1280x640) and the docs site's og:image size (1200x630).
    b = banner()
    save_png(b, ROOT / ".github/assets/banner.png")
    out.append(ROOT / ".github/assets/banner.png")
    social = card(1280, 640, 420, 40)
    put(social, "social-preview.png")
    save_png(social, ROOT / ".github/assets/social-preview.png")
    out.append(ROOT / ".github/assets/social-preview.png")
    put(card(1200, 630, 410, 38), "og.png")

    # The docs site's copies (it can only serve files under docs/).
    out += copy_docs_assets()

    for p in out:
        with Image.open(p) as im:
            print(f"{p.relative_to(ROOT).as_posix():44} {im.width:>5}x{im.height:<5} {p.stat().st_size:>9,} bytes")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="only check palette.json and the docs site's tokens and image copies")
    ap.add_argument("--import-masters", nargs=2, metavar=("FULL", "EMBLEM"), type=Path)
    args = ap.parse_args()
    ok = check_contrast()
    if args.check:
        docs_ok = check_docs()
        sys.exit(0 if ok and docs_ok else 1)
    if not ok:
        sys.exit("palette.json contrast table is out of date or a pair fails AA")
    if args.import_masters:
        import_masters(*args.import_masters)
    global LOGO, EMBLEM, EMBLEM_SQ
    LOGO = Image.open(HERE / "logo-full.png").convert("RGBA")
    EMBLEM = Image.open(HERE / "emblem.png").convert("RGBA")
    if LOGO.size != (LOGO_W, LOGO_H):
        sys.exit(f"logo-full.png is {LOGO.size}, expected {(LOGO_W, LOGO_H)}; update LOGO_W and LOGO_H")
    EMBLEM_SQ = emblem_square()
    build()
    if not check_docs():
        sys.exit("the docs site's colour tokens or theme colour differ from palette.json")


if __name__ == "__main__":
    main()
