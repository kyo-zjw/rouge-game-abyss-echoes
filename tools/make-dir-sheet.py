#!/usr/bin/env python3
"""Turn direction renders into one horizontal game sprite strip.

The engine (js/core.js) slices a horizontal strip with `frames / frameW / frameH`.
The canonical 8-way sector order used by js/ui.js is:

    0 E  right      1 SE downRight   2 S  front       3 SW downLeft
    4 W  left       5 NW upLeft      6 N  back        7 NE upRight

`--frames` picks a subset and fixes the strip order. The game currently ships a
4-frame strip (downRight, front, downLeft, back) because 8 frames read as jittery
at 78 px; pure left/right profiles were dropped as they looked bad on chibi art.

Keying reuses abyss-echoes/tools/seedream-post.py so the alpha edge matches the
rest of assets/ (border-seeded flood fill + hue guard + fringe despill).

All 8 frames share ONE scale factor so relative body size is preserved; each
frame is bottom-aligned and horizontally centred in a square cell.
"""

from __future__ import annotations

import argparse
import importlib.util
import os
import sys

import numpy as np
from PIL import Image

ORDER = ["right", "downRight", "front", "downLeft", "left", "upLeft", "back", "upRight"]


def load_post(path: str):
    spec = importlib.util.spec_from_file_location("seedream_post", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def key_one(post, path: str, key_hex: str, tol: int, max_side: int = 640):
    """Return (premultiplied-safe RGBA numpy array cropped to the subject)."""
    im = Image.open(path).convert("RGB")
    if max(im.size) > max_side:
        s = max_side / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.Resampling.LANCZOS)
    rgb = np.array(im)
    key = post.hex_rgb(key_hex)
    mask = post.key_background(rgb, key, tol)
    coverage = 1.0 - mask.mean()
    if coverage < 0.005:
        raise RuntimeError(f"{os.path.basename(path)}: chroma key removed the whole image")
    if coverage > 0.98:
        raise RuntimeError(f"{os.path.basename(path)}: chroma key found almost no background")
    rgb = post.despill(rgb, mask, key)
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        raise RuntimeError(f"{os.path.basename(path)}: no opaque pixels after keying")
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="directory holding <name>.png for the 8 directions")
    ap.add_argument("--out", required=True, help="output strip png")
    ap.add_argument("--cell", type=int, default=512)
    ap.add_argument("--frames", default=",".join(ORDER),
                    help="逗号分隔的输出帧序 (默认 8 向全要)，可选值: " + ",".join(ORDER))
    ap.add_argument("--fill", type=float, default=0.94, help="subject height as a fraction of the cell")
    ap.add_argument("--bottom-margin", type=int, default=2)
    ap.add_argument("--key-color", default="#00FF00")
    ap.add_argument("--tol", type=int, default=110)
    ap.add_argument("--post", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "seedream-post.py"))
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    post = load_post(args.post)
    names = [n.strip() for n in args.frames.split(",") if n.strip()]
    if not names:
        print("--frames 不能为空", file=sys.stderr)
        return 1
    bad = [n for n in names if n not in ORDER]
    if bad:
        print(f"未知方向 {bad}，可选: {ORDER}", file=sys.stderr)
        return 1

    subjects = []
    for name in names:
        p = os.path.join(args.dir, name + ".png")
        if not os.path.exists(p):
            print(f"missing direction image: {p}", file=sys.stderr)
            return 1
        subjects.append((name, key_one(post, p, args.key_color, args.tol)))

    # One scale for every frame keeps the body size consistent across directions.
    heights = [s.shape[0] for _, s in subjects]
    med = float(np.median(heights))
    scale = (args.cell * args.fill) / med
    print(f"subject heights (px @<=640): {heights}  median={med:.0f}  common scale={scale:.3f}")

    cell = args.cell
    canvas = np.zeros((cell, cell * len(subjects), 4), dtype=np.uint8)
    for i, (name, subj) in enumerate(subjects):
        w = max(1, round(subj.shape[1] * scale))
        h = max(1, round(subj.shape[0] * scale))
        img = post.premultiplied_resize(subj, w, h)
        arr = np.array(img)
        if w > cell or h > cell:
            raise RuntimeError(f"{name}: scaled subject {w}x{h} does not fit a {cell}px cell")
        ox = i * cell + (cell - w) // 2
        oy = cell - h - args.bottom_margin
        canvas[oy:oy + h, ox:ox + w] = arr
        print(f"  {i} {name:10s} -> {w}x{h} at x={ox}")

    out = Image.fromarray(canvas, "RGBA")
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    tmp = args.out + ".tmp.png"
    out.save(tmp, "PNG", optimize=True)
    os.replace(tmp, args.out)
    print(f"saved {args.out} ({out.width}x{out.height})")

    if args.debug:
        dbg_path = os.path.splitext(args.out)[0] + ".preview.png"
        pw = 160
        bg = Image.new("RGBA", (pw * len(subjects), pw), (32, 32, 32, 255))
        for yy in range(0, pw, 10):
            for xx in range(0, pw, 10):
                if ((xx // 10) + (yy // 10)) % 2 == 0:
                    bg.paste((92, 92, 92, 255), (xx, yy, min(xx + 10, pw), min(yy + 10, pw)))
        strip = bg.copy()
        for i in range(len(subjects)):
            piece = out.crop((i * cell, 0, (i + 1) * cell, cell)).resize((pw, pw), Image.Resampling.LANCZOS)
            strip.alpha_composite(piece, (i * pw, 0))
        strip.convert("RGB").save(dbg_path, optimize=True)
        print(f"saved {dbg_path}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"make-dir-sheet failed: {exc}", file=sys.stderr)
        sys.exit(1)
