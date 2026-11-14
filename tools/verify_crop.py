"""Visual verification tool for dataset crop box and grid overlay."""

import cv2
import json
import numpy as np


def verify_crop(still_path, config_path, out_path):
    with open(config_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    img = cv2.imread(still_path)
    h_orig, w_orig = img.shape[:2]

    crop = cfg["crop"]
    cx, cy, cw, ch = crop["x"], crop["y"], crop["w"], crop["h"]
    gw, gh = cfg["grid"]["w"], cfg["grid"]["h"]

    preview = img.copy()

    # Draw grid lines within crop
    for r in range(gh + 1):
        y = int(cy + r * ch / gh)
        cv2.line(preview, (cx, y), (cx + cw, y), (0, 255, 255), 1)

    for c in range(gw + 1):
        x = int(cx + c * cw / gw)
        cv2.line(preview, (x, cy), (x, cy + ch), (0, 255, 255), 1)

    # Highlight crop border
    cv2.rectangle(preview, (cx, cy), (cx + cw, cy + ch), (0, 0, 255), 2)

    # Darken region outside crop (e.g. bottom banner)
    mask = np.zeros((h_orig, w_orig), dtype=bool)
    mask[cy:cy + ch, cx:cx + cw] = True
    preview[~mask] = (preview[~mask] * 0.4).astype(np.uint8)

    cv2.imwrite(out_path, preview)
    print(f"Visual crop preview written to {out_path} ({cw}x{ch} inside {w_orig}x{h_orig})")


if __name__ == "__main__":
    verify_crop("tools/sst_still.png", "datasets/sst.json", "tools/sst_crop_preview.png")

