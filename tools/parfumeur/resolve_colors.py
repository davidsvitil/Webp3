#!/usr/bin/env python3
"""Give colour variants a swatch HEX when the source shop has none.
usage: resolve_colors.py <parsed.json> <out.json> <ref_catalog.json> [<ref_catalog.json> ...]
1) same product line + same shade code in a reference catalog (e.g. Montana BLACK 1010)
2) same shade name in a reference catalog
3) colour words in the shade name (EN/CZ), RAL family as a last resort
Resolved labels get " #RRGGBB" appended, so build_catalog.py turns them into swatches.
"""
import sys, json, re, unicodedata, colorsys

src, out, *refs = sys.argv[1:]
data = json.load(open(src))


from colorwords import norm, by_words  # noqa: E402

LINES = {  # product-name pattern -> reference product id
    r'montana black': 'montana-black-400ml', r'montana gold': 'montana-gold-400ml',
    r'montana blue|montana water': 'montana-blue-400ml-water-based', r'\bloop\b': 'loop-400ml',
    r'kobra': 'kobra-paint-hp-400ml-high-pressure', r'\bdope\b': 'dope-cans-classic-400ml',
    r'posca': 'uni-posca-pc-5m', r'toki': 'toki-marker-fader', r'stylefile': 'stylefile-marker-single',
}
by_line, by_name = {}, {}
for rf in refs:
    for p in json.load(open(rf))['products']:
        if p.get('opt', {}).get('type') != 'color': continue
        for v in p['opt']['values']:
            h = v.get('h')
            if not h: continue
            code = re.sub(r'\D', '', v.get('c') or '') or (re.match(r'^\d{2,5}', v.get('l', '')) or [None])[0]
            if code: by_line.setdefault(p['id'], {}).setdefault(code, h)
            nm = norm(re.sub(r'^\S*\d\S*\s+', '', v.get('n') or v.get('l', '')))
            if nm and len(nm) > 2: by_name.setdefault(nm, h)


stats = [0, 0, 0, 0]
for x in data:
    vs = x.get('variants') or []
    if not vs or not re.search(r'barv|odstín|odstin', (x.get('opt_label') or '').lower()): continue
    # configurators (leather × thread × buckle …): keep one swatch per main leather colour
    if sum(' · ' in v['label'] for v in vs) > len(vs) / 2:
        grp = {}
        for v in vs:
            k = v['label'].split(' · ')[0].strip()
            g = grp.setdefault(k, dict(v, label=k))
            g['czk'] = min(g['czk'] or 10**9, v['czk'] or 10**9)
            g['stock'] = g['stock'] or v['stock']
        vs = x['variants'] = list(grp.values())
        x['configurator'] = True
    line = next((pid for rx, pid in LINES.items() if re.search(rx, x['name'], re.I)), None)
    for v in vs:
        lab = re.sub(r'\s+', ' ', v['label']).strip()
        v['label'] = lab
        if re.search(r'#[0-9a-fA-F]{6}', lab): continue
        if lab.lower().startswith('random'):
            v['label'] = lab + ' #8C8C8C'; continue
        h = None
        code = (re.match(r'^(?:[A-Z]{1,3}[- ]?)?(\d{2,5})\b', lab) or [None, None])[1]
        if line and code and line in by_line: h = by_line[line].get(code); stats[0] += bool(h)
        if not h:
            nm = norm(re.sub(r'^\S*\d\S*\s+', '', lab))
            h = by_name.get(nm); stats[1] += bool(h)
        if not h:
            h = by_words(lab); stats[2] += bool(h)
        if h: v['label'] = f'{lab} {h}'
        else: stats[3] += 1
json.dump(data, open(out, 'w'), ensure_ascii=False, indent=0)
print('by code %d, by name %d, by words %d, unresolved %d' % tuple(stats))
