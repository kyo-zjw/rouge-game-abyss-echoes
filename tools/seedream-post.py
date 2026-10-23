#!/usr/bin/env python3
"""Post-process a Seedream PNG into a game-ready asset.

Modes:
  sprite / icon : chroma-key the flat background, crop to alpha, pad, resize (RGBA PNG)
  background    : cover-crop to the requested size (RGB/RGBA PNG)
  raw           : resize only, no keying

The keying is done at a reduced resolution (<= 640 px) with a border-seeded flood
fill, which handles the smooth gradients Seedream often paints even when asked for
a flat chroma color. Alpha is then resized with premultiplied color to avoid halos.
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import deque

import numpy as np
from PIL import Image


def hex_rgb(value: str) -> tuple[int, int, int]:
    value = value.strip().lstrip("#")
    if len(value) != 6:
        raise argparse.ArgumentTypeError(f"expected #RRGGBB, got {value!r}")
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def dilate(mask: np.ndarray, rounds: int = 1) -> np.ndarray:
    out = mask.copy()
    for _ in range(rounds):
        p = np.pad(out, 1, mode="constant", constant_values=False)
        out = (
            p[1:-1, 1:-1]
            | p[:-2, 1:-1]
            | p[2:, 1:-1]
            | p[1:-1, :-2]
            | p[1:-1, 2:]
        )
    return out


def key_background(rgb: np.ndarray, key: tuple[int, int, int], tol: int) -> np.ndarray:
    """Return a bool mask of background pixels connected to the border."""
    h, w, _ = rgb.shape
    f = rgb.astype(np.int16)
    key_arr = np.array(key, dtype=np.int16)

    border = np.concatenate([f[0, :, :], f[-1, :, :], f[:, 0, :], f[:, -1, :]], axis=0)
    bg = np.median(border, axis=0)
    # A uniform border is the best evidence of the real background color, even
    # when the model painted a darker shade than the requested chroma key.
    border_std = float(border.std(axis=0).max())
    if border_std > 40:
        bg = key_arr

    d_key = np.max(np.abs(f - key_arr), axis=2)
    d_bg = np.max(np.abs(f - bg), axis=2)
    # Chroma guard: the fill may only walk through pixels that actually share
    # the key hue. This keeps pale robes, brown leather and cyan highlights
    # opaque while still removing shadowed green/magenta backdrop.
    if key[1] >= key[0] and key[1] >= key[2]:
        chroma = (f[..., 1] > f[..., 0] + 18) & (f[..., 1] > f[..., 2] + 18)
    else:
        chroma = (f[..., 0] > f[..., 1] + 18) & (f[..., 2] > f[..., 1] + 18)
    allowed = ((d_bg < tol) | (d_key < tol)) & chroma

    mask = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if not mask[y, x] and allowed[y, x] and (d_bg[y, x] < 55 or d_key[y, x] < 40):
            mask[y, x] = True
            q.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    # Local step limit lets the fill walk a smooth gradient but not jump across
    # a hard character outline.
    step_tol = 24
    while q:
        x, y = q.popleft()
        c = f[y, x]
        if x > 0:
            nx, ny = x - 1, y
            if not mask[ny, nx] and allowed[ny, nx]:
                if int(np.max(np.abs(f[ny, nx] - c))) <= step_tol:
                    mask[ny, nx] = True
                    q.append((nx, ny))
        if x + 1 < w:
            nx, ny = x + 1, y
            if not mask[ny, nx] and allowed[ny, nx]:
                if int(np.max(np.abs(f[ny, nx] - c))) <= step_tol:
                    mask[ny, nx] = True
                    q.append((nx, ny))
        if y > 0:
            nx, ny = x, y - 1
            if not mask[ny, nx] and allowed[ny, nx]:
                if int(np.max(np.abs(f[ny, nx] - c))) <= step_tol:
                    mask[ny, nx] = True
                    q.append((nx, ny))
        if y + 1 < h:
            nx, ny = x, y + 1
            if not mask[ny, nx] and allowed[ny, nx]:
                if int(np.max(np.abs(f[ny, nx] - c))) <= step_tol:
                    mask[ny, nx] = True
                    q.append((nx, ny))

    # Green-key cleanup: enclosed green gaps and green spill are always
    # background for these assets (characters, beasts, undead, demons, dragons).
    # Green-bodied subjects (ooze) use a magenta key instead.
    if key[1] >= key[0] and key[1] >= key[2]:
        greenish = (f[..., 1] > f[..., 0] + 55) & (f[..., 1] > f[..., 2] + 55)
        mask |= greenish

    return mask


def despill(rgb: np.ndarray, mask: np.ndarray, key: tuple[int, int, int]) -> np.ndarray:
    """Pull the key color out of the 2px fringe around the alpha edge."""
    edge = dilate(mask, 2) & ~mask
    if not edge.any():
        return rgb
    out = rgb.astype(np.float32)
    kr, kg, kb = key
    # Kill the dominant key channel on the fringe only.
    if kg >= kr and kg >= kb:
        out[..., 1][edge] = np.minimum(out[..., 1][edge], np.maximum(out[..., 0][edge], out[..., 2][edge]))
    elif kr >= kg and kr >= kb:
        out[..., 0][edge] = np.minimum(out[..., 0][edge], np.maximum(out[..., 1][edge], out[..., 2][edge]))
    else:
        out[..., 2][edge] = np.minimum(out[..., 2][edge], np.maximum(out[..., 0][edge], out[..., 1][edge]))
    return np.clip(out, 0, 255).astype(np.uint8)


def premultiplied_resize(rgba: np.ndarray, width: int, height: int) -> Image.Image:
    arr = rgba.astype(np.float32)
    a = arr[..., 3:4] / 255.0
    arr[..., :3] *= a
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    out = np.array(img).astype(np.float32)
    aa = out[..., 3:4] / 255.0
    out[..., :3] = np.where(aa > 0.002, out[..., :3] / np.maximum(aa, 0.002), 0)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def process_sprite(path: str, args: argparse.Namespace) -> Image.Image:
    im = Image.open(path).convert("RGB")
    # Key at a manageable size; the model's 2K output is overkill for this step.
    max_side = 640
    if max(im.size) > max_side:
        scale = max_side / max(im.size)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.Resampling.LANCZOS)
    rgb = np.array(im)
    key = hex_rgb(args.key_color)
    mask = key_background(rgb, key, args.tol)

    coverage = 1.0 - mask.mean()
    if coverage < 0.005:
        raise RuntimeError("chroma key removed the whole image; try another --key-color or --no-key")
    if coverage > 0.98:
        raise RuntimeError("chroma key found almost no background; is the flat background missing?")

    rgb = despill(rgb, mask, key)
    alpha = np.where(mask, 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])

    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        raise RuntimeError("no opaque pixels after keying")
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    subject = rgba[y0:y1, x0:x1]

    pad = int(round(max(subject.shape[0], subject.shape[1]) * args.pad))
    side = max(subject.shape[0], subject.shape[1]) + pad * 2
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    oy = (side - subject.shape[0]) // 2
    ox = (side - subject.shape[1]) // 2
    canvas[oy:oy + subject.shape[0], ox:ox + subject.shape[1]] = subject

    target = args.target or 128
    out = premultiplied_resize(canvas, target, target)
    if args.debug:
        dbg = Image.new("RGBA", out.size, (32, 32, 32, 255))
        checker = Image.new("RGBA", out.size, (64, 64, 64, 255))
        for yy in range(0, out.height, 8):
            for xx in range(0, out.width, 8):
                if ((xx // 8) + (yy // 8)) % 2 == 0:
                    checker.paste((96, 96, 96, 255), (xx, yy, min(xx + 8, out.width), min(yy + 8, out.height)))
        dbg = Image.alpha_composite(dbg, checker)
        dbg = Image.alpha_composite(dbg, out)
        dbg.convert("RGB").save(os.path.splitext(args.out)[0] + ".preview.png", optimize=True)
    return out


def process_background(path: str, args: argparse.Namespace) -> Image.Image:
    im = Image.open(path).convert("RGB")
    width = args.width or 2400
    height = args.height or 1600
    # ImageOps.fit does the centered cover crop without stretching.
    from PIL import ImageOps
    return ImageOps.fit(im, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.5))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mode", choices=["sprite", "icon", "background", "raw"], default="sprite")
    ap.add_argument("--key-color", default="#00FF00")
    ap.add_argument("--target", type=int, default=0)
    ap.add_argument("--width", type=int, default=0)
    ap.add_argument("--height", type=int, default=0)
    ap.add_argument("--pad", type=float, default=0.10)
    ap.add_argument("--tol", type=int, default=110)
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    if args.mode in ("sprite", "icon"):
        out = process_sprite(args.input, args)
    elif args.mode == "background":
        out = process_background(args.input, args)
    else:
        out = Image.open(args.input).convert("RGBA")
        if args.target and out.width != args.target:
            out = out.resize((args.target, args.target), Image.Resampling.LANCZOS)

    tmp = args.out + ".tmp.png"
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    if out.mode == "RGBA":
        out.save(tmp, "PNG", optimize=True)
    else:
        out.convert("RGB").save(tmp, "PNG", optimize=True)
    os.replace(tmp, args.out)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"post-process failed: {exc}", file=sys.stderr)
        sys.exit(1)
