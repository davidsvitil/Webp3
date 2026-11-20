#!/usr/bin/env python3
"""Page colour from the colour word in a product name (uses the word table of resolve_colors.py).
usage: name_colors.py <catalog.json> [skip_cat ...]   Greys/blacks are left to the category colour."""
import sys, json, re, colorsys, importlib.util, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from colorwords import by_words, norm  # noqa: E402

f = sys.argv[1]; skip = set(sys.argv[2:])
d = json.load(open(f)); n = 0
for p in d['products']:
    p.pop('col', None); p.pop('col2', None)
    if p['cat'] in skip: continue
    words = norm(p['id'].replace('-', ' '))
    words = re.sub(r'\b(cerny|cerne)\b', 'cerna', words)
    words = re.sub(r'\b(konakovy|konakove)\b', 'konakova', words)
    words = re.sub(r'\b(hnedy|hnede)\b', 'hneda', words)
    words = re.sub(r'\b(zeleny|zelene)\b', 'zelena', words)
    words = re.sub(r'\b(modry|modre)\b', 'modra', words)
    words = re.sub(r'\b(cerveny|cervene)\b', 'cervena', words)
    words = re.sub(r'\b(fialovy|fialove)\b', 'fialova', words)
    words = words.replace('marine amber', 'amber').replace('pastel blue', 'sky').replace('pastel pink', 'pink').replace('pastel green', 'mint')
    words = re.sub(r'\b(pudrovy|pudrove|pudrova)\b', 'rose', words)
    words = re.sub(r'\b(olivovy|olivove)\b', 'olivova', words)
    # pick the colour word itself, not trailing words such as "kozena"
    h = None
    for w in words.split():
        h = by_words(w)
        if h: break
    if not h: continue
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    hh, l, s = colorsys.rgb_to_hls(r, g, b)
    if s < .12 or l < .14: continue
    p['col'] = h; n += 1
json.dump(d, open(f, 'w'), ensure_ascii=False, separators=(',', ':'))
print(n, 'products coloured of', len(d['products']))
