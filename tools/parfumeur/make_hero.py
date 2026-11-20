#!/usr/bin/env python3
"""Cut product photos out of their white background for the hero carousel.
usage: make_hero.py <site_dir> <product_id> [<product_id> ...]   -> assets/img/hero/<id>.webp
"""
import sys, os, json
from PIL import Image, ImageDraw, ImageFilter, ImageChops
site = sys.argv[1]
cat = json.load(open(os.path.join(site, 'data/catalog.json')))
by = {p['id']: p for p in cat['products']}
os.makedirs(os.path.join(site, 'assets/img/hero'), exist_ok=True)
for pid in sys.argv[2:]:
    p = by.get(pid)
    if not p: print('missing', pid); continue
    im = Image.open(os.path.join(site, p['img'][0])).convert('RGB')
    w, h = im.size
    # background = low-saturation light pixels (white + soft grey shadow) connected to the border
    lim = int(os.environ.get("HERO_LIGHT", 232))
    hsv = im.convert('HSV')
    _, sat, val = hsv.split()
    cand = Image.eval(Image.merge('RGB', (sat, val, val)).convert('L'), lambda v: 0)
    sp, vp = sat.load(), val.load()
    cand = Image.new('L', (w, h), 0); cp = cand.load()
    for yy in range(h):
        for xx in range(w):
            if vp[xx, yy] >= lim and sp[xx, yy] <= 40: cp[xx, yy] = 255
    for x, y in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if cp[x, y] == 255: ImageDraw.floodfill(cand, (x, y), 128)
    mask = cand.point(lambda v: 0 if v == 128 else 255)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert('RGBA'); out.putalpha(mask)
    bb = mask.point(lambda v: 255 if v > 30 else 0).getbbox()
    if bb: out = out.crop(bb)
    if os.environ.get('HERO_ROTATE') and out.width > 1.6 * out.height:
        out = out.rotate(90, expand=True)  # lying pens stand upright like cans in the carousel
    out.thumbnail((700, 900))
    out.save(os.path.join(site, 'assets/img/hero', pid + '.webp'), 'WEBP', quality=82, method=5)
    cover = 1 - (mask.histogram()[0] / (w * h))
    print(pid, out.size, f'object {cover:.0%}')
