#!/usr/bin/env python3
"""Turn parsed shop JSON into the storefront catalog (Montana-format) + WebP images.
usage: build_catalog.py <parsed.json> <site_dir> <config.json>
config: {"strip": [regex,...], "cats": {"Crumb name": ["catkey","Cat label"]}, "subdepth": 1,
         "max_per_sub": 0, "drop": [regex,...], "rate": 24.3}
"""
import sys, os, re, json, hashlib, subprocess, unicodedata, colorsys, io, concurrent.futures as cf
from PIL import Image

src, site, cfgf = sys.argv[1:4]
cfg = json.load(open(cfgf))
data = json.load(open(src))
imgdir = os.path.join(site, 'assets/img/p'); os.makedirs(imgdir, exist_ok=True)
cache = os.path.join(os.path.dirname(os.path.abspath(src)), 'imgcache'); os.makedirs(cache, exist_ok=True)
HEX = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60]


def fetch(u):
    f = os.path.join(cache, hashlib.md5(u.encode()).hexdigest())
    if not os.path.exists(f):
        r = subprocess.run(['curl', '-sL', '-m', '40', '-A', 'Mozilla/5.0 (concept-preview)', '-o', f, '-w', '%{http_code}', u], capture_output=True, text=True)
        if r.stdout != '200':
            if os.path.exists(f): os.remove(f)
            return None
    return f


def accent(im):
    """Most saturated dominant colour of an image (ignores white/grey background)."""
    sm = im.convert('RGB').resize((64, 64))
    best, score = None, 0
    buckets = {}
    for r, g, b in sm.getdata():
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        if l > .93 or l < .06 or s < .25: continue
        k = (r // 32, g // 32, b // 32)
        buckets.setdefault(k, []).append((r, g, b, s))
    for k, px in buckets.items():
        sc = len(px) * (sum(p[3] for p in px) / len(px)) ** 1.5
        if sc > score:
            score = sc
            best = tuple(sum(p[i] for p in px) // len(px) for i in range(3))
    if not best or score < 40: return None
    return '#%02x%02x%02x' % best


def save_webp(u, name):
    f = fetch(u)
    if not f: return None, None
    try:
        im = Image.open(f); im.load()
    except Exception:
        return None, None
    if im.mode in ('P', 'LA', 'RGBA'):
        bg = Image.new('RGB', im.size, (255, 255, 255))
        im = im.convert('RGBA'); bg.paste(im, mask=im.split()[3]); im = bg
    im = im.convert('RGB')
    im.thumbnail((900, 900))
    out = os.path.join(imgdir, name + '.webp')
    im.save(out, 'WEBP', quality=78, method=5)
    return 'assets/img/p/' + name + '.webp', accent(im)


strip = [re.compile(x, re.I) for x in cfg.get('strip', [])]
drop = [re.compile(x, re.I) for x in cfg.get('drop', [])]
catmap = cfg['cats']
cats, products, seen = {}, [], set()
for i, x in enumerate(data):
    if any(d.search(x['name']) or d.search(' > '.join(x['crumbs'])) for d in drop): continue
    crumbs = [c for c in (x['crumbs'] or ['Ostatní']) if c not in cfg.get('skip_crumbs', [])] or ['Ostatní']
    # map: first crumb that matches a configured category
    ck = None
    for j, c in enumerate(crumbs):
        if c in catmap:
            ck = catmap[c]; rest = crumbs[j + 1:]; break
    if not ck:
        if '*' not in catmap: continue
        ck = catmap['*']; rest = crumbs[1:]
    key, label = ck
    cat = cats.setdefault(key, {'key': key, 'cs': label, 'en': label, 'subs': {}})
    sub = None
    if key in cfg.get('brand_sub', []) and x.get('brand'):
        rest = [x['brand']]
    if rest:
        sl = rest[0]
        sub = slug(sl)
        cat['subs'].setdefault(sub, {'key': sub, 'cs': sl, 'en': sl, 'n': 0})
        cat['subs'][sub]['n'] += 1
    name = x['name']
    for r in strip: name = r.sub('', name)
    name = re.sub(r'\s+', ' ', name).strip(' ,-–')
    pid = slug(name) or 'p'
    k = 2
    while pid in seen: pid = f'{slug(name)}-{k}'; k += 1
    seen.add(pid)
    p = {'id': pid, 'pid': i + 1, 'cat': key, 'sub': sub, 'name': {'cs': name}, 'short': {'cs': x['short']},
         'desc': {'cs': x['desc']}, 'dl': [], 'src': x['url'], 'brand': x.get('brand'), 'sku': x.get('sku'),
         '_imgs': x['imgs']}
    vs = [v for v in x['variants'] if v.get('czk')]
    if vs:
        hexes = sum(1 for v in vs if HEX.search(v['label']))
        if hexes >= len(vs) * .6:
            vals = []
            for n, v in enumerate(vs):
                m = HEX.search(v['label'])
                h = '#' + (m.group(1) if m else 'cccccc')
                if len(h) == 4: h = '#' + ''.join(c * 2 for c in h[1:])
                lab = HEX.sub('', v['label']).strip()
                cm = re.match(r'^([A-Z]{1,4}[- ]?\d{2,5}[A-Z]?|\d{3,5}|RV-\S+)\s+(.*)$', lab)
                code, nm = (cm.group(1), cm.group(2)) if cm else ('', lab)
                vals.append({'id': n + 1, 'l': lab, 'n': nm.strip(), 'c': code, 'h': h.upper()})
            p['opt'] = {'type': 'color', 'label': {'cs': x.get('opt_label') or 'Odstín'}, 'values': vals}
        else:
            vals = [{'id': n + 1, 'l': v['label']} for n, v in enumerate(vs)]
            p['opt'] = {'type': 'size', 'label': {'cs': x.get('opt_label') or 'Varianta'}, 'values': vals}
        p['var'] = [{'v': int(re.sub(r'\D', '', str(v['id'])) or n + 1) if str(v['id']).isdigit() else (p['pid'] * 1000 + n + 1),
                     'o': n + 1, 'czk': v['czk'], 'q': 99 if v['stock'] else 0} for n, v in enumerate(vs)]
        prices = [v['czk'] for v in vs]
        p['czk'] = min(prices); p['from'] = len(set(prices)) > 1
        p['stock'] = sum(1 for v in vs if v['stock'])
    else:
        p['czk'] = x['price']; p['from'] = False; p['stock'] = 1 if x['stock'] else 0
    products.append(p)

# optional cap per sub-category (keeps big catalogs light): in-stock first
cap = cfg.get('max_per_sub', 0)
if cap:
    grp = {}
    for p in products: grp.setdefault((p['cat'], p['sub']), []).append(p)
    keep = set()
    for g in grp.values():
        g.sort(key=lambda p: (-bool(p['stock']), -len(p['_imgs'])))
        keep.update(id(p) for p in g[:cap])
    products = [p for p in products if id(p) in keep]


def do_imgs(p):
    out, col = [], None
    for n, u in enumerate(p['_imgs'][:cfg.get('max_imgs', 5)]):
        path, a = save_webp(u, f"{p['pid']}-{n}")
        if path:
            out.append(path)
            if n == 0: col = a
    return p, out, col


with cf.ThreadPoolExecutor(6) as ex:
    for k, (p, imgs, col) in enumerate(ex.map(do_imgs, products)):
        p['img'] = imgs
        if col: p['col'] = col
        del p['_imgs']
        if k % 100 == 0: print('img', k, len(products), flush=True)

products = [p for p in products if p['img'] and p['czk']]
order = list(dict.fromkeys(v[0] for v in catmap.values()))
cl = []
for key in order:
    if key not in cats: continue
    c = cats[key]
    subs = [s for s in c['subs'].values() if any(p['cat'] == key and p['sub'] == s['key'] for p in products)]
    for s in subs: s.pop('n', None)
    c['subs'] = subs
    if any(p['cat'] == key for p in products): cl.append(c)
os.makedirs(os.path.join(site, 'data'), exist_ok=True)
json.dump({'generated': cfg.get('date', '2026-11-18'), 'rate': cfg.get('rate', 24.3), 'cats': cl, 'products': products},
          open(os.path.join(site, 'data/catalog.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(products), 'products,', len(cl), 'cats')
