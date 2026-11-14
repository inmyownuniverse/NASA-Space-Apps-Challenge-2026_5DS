# Owner: Aahana · Support: Celene
"""Sample a colorbar image and print the "stops" JSON array for a dataset config.

Usage:
    python tools/sample_colorbar.py IMAGE X1 Y1 X2 Y2 MIN MAX N

    IMAGE   screenshot / frame that contains the colorbar (PNG or JPG)
    X1 Y1   pixel at the start of the colorbar (the MIN end)
    X2 Y2   pixel at the end of the colorbar (the MAX end)
    MIN MAX data values at the two ends (e.g. 0 30 for °C)
    N       number of stops to sample (e.g. 16)

Example:
    python tools/sample_colorbar.py tools/sst_frame.png 400 690 880 690 0 30 16

Each sample averages a 3x3 patch to smooth out compression noise.
Paste the printed array into "colorbar": { "stops": [...] } in datasets/<id>.json.
"""

import argparse
import json

import numpy as np
from PIL import Image


def sample_stops(path, x1, y1, x2, y2, vmin, vmax, n):
    img = np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)
    h, w, _ = img.shape
    stops = []
    for i in range(n):
        t = i / (n - 1) if n > 1 else 0.0
        x = round(x1 + (x2 - x1) * t)
        y = round(y1 + (y2 - y1) * t)
        patch = img[max(0, y - 1):min(h, y + 2), max(0, x - 1):min(w, x + 2)]
        rgb = [int(round(c)) for c in patch.reshape(-1, 3).mean(axis=0)]
        value = round(vmin + (vmax - vmin) * t, 3)
        stops.append({"rgb": rgb, "value": value})
    return stops


def main():
    p = argparse.ArgumentParser(description="Sample colorbar stops from an image.")
    p.add_argument("image")
    p.add_argument("x1", type=int)
    p.add_argument("y1", type=int)
    p.add_argument("x2", type=int)
    p.add_argument("y2", type=int)
    p.add_argument("min", type=float)
    p.add_argument("max", type=float)
    p.add_argument("n", type=int)
    a = p.parse_args()

    if a.n < 2:
        p.error("N must be at least 2")

    stops = sample_stops(a.image, a.x1, a.y1, a.x2, a.y2, a.min, a.max, a.n)
    print("[")
    print(",\n".join("  " + json.dumps(s) for s in stops))
    print("]")

    # TODO(Aahana): optional --show flag that saves a preview PNG with the sample points marked.


if __name__ == "__main__":
    main()
