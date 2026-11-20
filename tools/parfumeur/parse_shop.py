#!/usr/bin/env python3
"""Parse cached product pages (Upgates or Shoptet) into a flat JSON list.
usage: parse_shop.py <upgates|shoptet> <cachedir> <out.json>
"""
import sys, os, re, json, glob
from bs4 import BeautifulSoup

kind, cache, out = sys.argv[1:4]
HEX = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
ALLOWED = {'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'h2', 'h3', 'h4', 'br', 'table', 'tbody', 'tr', 'td', 'th'}


def clean_html(el, limit=6000):
    """Keep only simple formatting tags, drop attributes, scripts, images, links."""
    if el is None:
        return ''
    el = BeautifulSoup(str(el), 'lxml')
    for bad in el(['script', 'style', 'iframe', 'img', 'svg', 'form', 'button', 'noscript', 'video']):
        bad.decompose()
    for tag in el.find_all(True):
        if tag.name in ('html', 'body'):
            tag.unwrap(); continue
        if tag.name == 'h1':
            tag.name = 'h3'
        if tag.name not in ALLOWED:
            tag.unwrap(); continue
        tag.attrs = {}
    html = re.sub(r'\s+', ' ', str(el)).strip()
    html = re.sub(r'<(p|li|h3|h4)>\s*</\1>', '', html)
    html = html.replace('<html><body>', '').replace('</body></html>', '')
    return html[:limit]


def num(s):
    s = re.sub(r'[^\d,.]', '', s or '').replace(',', '.')
    try:
        return round(float(s))
    except ValueError:
        return None


def meta(s, prop, scope=None):
    el = (scope or s).select_one(f'[itemprop="{prop}"]')
    if not el:
        return None
    return el.get('content') or el.get('href') or el.get_text(' ', strip=True)


def parse_upgates(s, url):
    prod = s.select_one('[itemtype*="schema.org/Product"]') or s
    name = s.h1.get_text(' ', strip=True) if s.h1 else ''
    crumbs = [e.get_text(' ', strip=True) for e in s.select('[itemtype*="BreadcrumbList"] [itemprop="name"]')]
    crumbs = [c for c in crumbs if c and c != 'Domů']
    brand = None
    b = prod.select_one('[itemprop="brand"] [itemprop="name"]')
    if b: brand = b.get('content') or b.get_text(strip=True)
    imgs = []
    for el in prod.select('img[itemprop="image"], [itemprop="image"]'):
        u = el.get('src') or el.get('content') or el.get('href')
        if u and u.startswith('http') and 'logo' not in u and u not in imgs:
            imgs.append(u)
    # prefer the big lightbox versions when available
    big = [a.get('href') for a in s.select('a[data-lb-group="product"], .product-gallery a[href*="cdn-upgates"]') if a.get('href', '').startswith('http')]
    if big:
        imgs = list(dict.fromkeys(big + imgs))
    offer = prod.select_one('[itemprop="offers"]') or prod
    price = num(meta(s, 'price', offer))
    avail = (meta(s, 'availability', offer) or '').lower()
    short = ''
    d = prod.select_one('[itemprop="disambiguatingDescription"]')
    if d: short = re.sub(r'\s*Více$', '', d.get_text(' ', strip=True))
    if not short:
        d = prod.select_one('p[itemprop="description"]')
        if d: short = d.get_text(' ', strip=True)
    desc_el = s.select_one('#description') or s.select_one('.tab-content')
    if desc_el:
        h = desc_el.find(['h2', 'h3'])
        if h and h.get_text(strip=True) in ('Popis', 'Popis produktu'): h.decompose()
    desc = clean_html(desc_el)
    variants = []
    for tr in s.select('.variant-table tr.VariantTableRow'):
        tds = tr.find_all('td')
        if len(tds) < 5: continue
        label = re.sub(r'\s+', ' ', tds[1].get_text(' ', strip=True))
        av = tds[2].get_text(' ', strip=True)
        pr = num(tr.select_one('td.fw-b').get_text() if tr.select_one('td.fw-b') else '')
        code = tr.select_one('[title^="Kód"]')
        im = tr.select_one('a.Lightbox')
        variants.append({'id': (tr.get('id') or '').replace('variant_', ''), 'label': label,
                         'stock': 'skladem' in av.lower(), 'avail': av, 'czk': pr,
                         'sku': code['title'].replace('Kód:', '').strip() if code else None,
                         'img': im.get('data-lb-url') if im else None})
    opt_label = None
    lab = s.select_one('.VariantSelect label, .variants label')
    if lab: opt_label = lab.get_text(' ', strip=True)
    return dict(url=url, name=name, crumbs=crumbs, brand=brand, sku=meta(s, 'sku', prod), price=price,
                stock='instock' in avail, imgs=imgs[:8], short=short, desc=desc, variants=variants, opt_label=opt_label)


def vlabel(t):
    """Tidy Shoptet variant labels: drop surcharges and 'Vyberte …:' prompts, shorten belt sizes."""
    t = re.sub(r'\s*\([+-]?\s*\d[\d ]*\s*Kč\)', '', t)
    t = re.sub(r',?\s*(Vyberte|Volba|Zvolte)[^:]{0,40}:\s*', ' · ', t).strip(' ·')
    t = re.sub(r',\s*[^,:·]{3,30}:\s*', ' · ', t).replace('.', '').strip(' ·')
    m = re.match(r'^(\w{1,4})\s*-\s*dírky na obvod\s*([\d\s–-]+cm)', t)
    if m: t = f"{m.group(1)} ({re.sub(r'\s+', ' ', m.group(2)).strip()})"
    return re.sub(r'\s+', ' ', t).strip()


def parse_shoptet(s, url):
    prod = s.select_one('[itemtype*="schema.org/Product"]')
    if not prod:
        return dict(url=url, name='', price=None, variants=[])
    name = s.h1.get_text(' ', strip=True) if s.h1 else ''
    nm = prod.select_one('meta[itemprop="name"]')
    if nm and nm.get('content'): name = re.sub(r'\s+', ' ', nm['content']).strip()
    subtitle = ''
    if s.h1:
        direct = re.sub(r'\s+', ' ', ''.join(x for x in s.h1.find_all(string=True, recursive=False))).strip()
        rest = name[len(direct):].strip() if direct and name.startswith(direct) else ''
        if len(rest) > 25: name, subtitle = direct, rest
    crumbs = [e.get_text(' ', strip=True) for e in s.select('[itemtype*="BreadcrumbList"] [itemprop="itemListElement"] > [itemprop="item"] [itemprop="name"], [itemtype*="BreadcrumbList"] [itemprop="name"]')]
    crumbs = list(dict.fromkeys(c for c in crumbs if c and c != 'Domů'))[:-1]
    brand = None
    b = prod.select_one('[itemprop="brand"] [itemprop="name"]')
    if b: brand = b.get('content') or b.get_text(strip=True)
    imgs = []
    for a in s.select('.p-image-wrapper a[href], .p-thumbnails a[href], a.p-main-image[href]'):
        u = a['href']
        if u.startswith('/'): u = re.match(r'https?://[^/]+', url).group(0) + u
        if u.startswith('http') and u not in imgs: imgs.append(u)
    if not imgs:
        m = prod.select_one('meta[itemprop="image"]')
        if m: imgs = [m['content']]
    offers = prod.select('[itemprop="offers"]')
    prices = [num(meta(s, 'price', o)) for o in offers]
    prices = [p for p in prices if p]
    avail = ' '.join((meta(s, 'availability', o) or '') for o in offers).lower()
    short = ''
    d = s.select_one('.p-short-description')
    if d: short = d.get_text(' ', strip=True)
    if not short: short = subtitle
    desc = clean_html(s.select_one('.basic-description') or s.select_one('#description'))
    variants = []
    # Shoptet variant table (products with several variants)
    for tr in s.select('table.variant-list tr, .variant-list .table-row'):
        nm2 = tr.select_one('.variant-name, .table-variant-name, td:first-child')
        pr = tr.select_one('.price-final, .variant-price')
        if not nm2 or not pr: continue
        label = re.sub(r'\s+', ' ', nm2.get_text(' ', strip=True))
        av = tr.select_one('.availability-label, .variant-availability')
        avt = av.get_text(' ', strip=True) if av else ''
        variants.append({'id': tr.get('data-micro-identifier') or label, 'label': label, 'czk': num(pr.get_text()),
                         'stock': 'skladem' in avt.lower(), 'avail': avt})
    if not variants:
        html = str(s)
        mid = re.search(r'"product": \{\s*"id": (\d+)', html)
        own_id = mid.group(1) if mid else None
        qty = {m.group(1).replace('\\/', '/'): m.group(2) for m in re.finditer(r'"code": "([^"]+)",\s*"weight": [^,]+,\s*"quantity": "([^"]*)"', html)}
        for m in re.finditer(r'"(\d+)":(\{"content_category".*?"category_path":\[[^\]]*\]\})', html):
            try:
                v = json.loads(m.group(2))
            except ValueError:
                continue
            if not v.get('variant') or (own_id and str(v.get('base_id')) != own_id): continue
            code = (v.get('content_ids') or [''])[0]
            q = qty.get(code, '')
            label = vlabel(re.sub(r'^[^:]{1,25}:\s*', '', v['variant']).strip())
            optl = v['variant'].split(':')[0].strip() if ':' in v['variant'] else None
            if optl:
                optl = re.sub(r'^(Vyberte|Zvolte|Volba)\s+', '', optl).strip().capitalize()
                optl = re.sub(r'^Barvu', 'Barva', re.sub(r'^Délku', 'Délka', optl))
            variants.append({'id': m.group(1), 'label': label, 'czk': num(str(v.get('value'))), 'sku': code,
                             'stock': bool(q) and q not in ('0', '-'), 'avail': q, 'optl': optl})
        if variants:
            seen = set(); uniq = []
            for v in variants:
                if v['id'] in seen: continue
                seen.add(v['id']); uniq.append(v)
            variants = uniq
    if not variants:
        sel = s.select_one('select#simple-variants-select, select[name="priceId"]')
        if sel:
            for o in sel.find_all('option'):
                if not o.get('value'): continue
                txt = re.sub(r'\s+', ' ', o.get_text(' ', strip=True))
                label = re.split(r'\s+[-–]\s+(?=[^-–]*(Skladem|Vyprodáno|Na dotaz|týden|dn))', txt)[0]
                variants.append({'id': o['value'], 'label': label.strip(), 'czk': num(o.get('data-price') or '') or None,
                                 'stock': o.get('data-disable-button') != '1' and 'vyprod' not in txt.lower(), 'avail': txt})
    return dict(url=url, name=name, crumbs=crumbs, brand=brand, sku=meta(s, 'sku', prod),
                price=min(prices) if prices else None, stock='instock' in avail, imgs=imgs[:8],
                short=short, desc=desc, variants=variants, opt_label=variants[0].get('optl') if variants else None)


def parse_tatiana(s, url):
    name = s.h1.get_text(' ', strip=True) if s.h1 else ''
    seg = url.split('brasnarstvitatiana.cz/')[-1].split('/')[0]
    cat = CATNAMES.get(seg, seg.replace('-', ' ').capitalize())
    box = s.select_one('div.bg-c1')
    price = num(box.select_one('.fs-2').get_text()) if box and box.select_one('.fs-2') else None
    avail = box.select_one('p.fw-bold').get_text(' ', strip=True) if box and box.select_one('p.fw-bold') else ''
    code = None
    if box:
        m = re.search(r'Objednací kód:\s*(\S+)', box.get_text(' ', strip=True))
        code = m.group(1) if m else None
    imgs = []
    for a in s.select('a.product-img[href]'):
        u = a['href']
        if not u.startswith('http'): u = 'https://www.brasnarstvitatiana.cz' + u
        if u not in imgs: imgs.append(u)
    lead = s.select_one('p.lead')
    desc = clean_html(s.select_one('#nav-desc'))
    return dict(url=url, name=name, crumbs=[cat], brand='Brašnářství Tatiana', sku=code, price=price,
                stock=True, imgs=imgs[:8], short=lead.get_text(' ', strip=True) if lead else '', desc=desc,
                variants=[], opt_label=None, avail=avail)


def parse_jsonld(s, url):
    """Shops with schema.org Product JSON-LD (luxusni-pera.cz)."""
    prod = None
    for sc in s.select('script[type="application/ld+json"]'):
        try:
            d = json.loads(sc.string or '')
        except ValueError:
            continue
        for x in (d if isinstance(d, list) else d.get('@graph', [d])):
            if isinstance(x, dict) and x.get('@type') in ('Product', 'ProductGroup') and not (prod and prod.get('@type') == 'ProductGroup'): prod = x
    if not prod:
        return dict(url=url, name='', price=None, variants=[])
    variants = []
    if prod.get('@type') == 'ProductGroup':
        base = prod.get('name', '')
        for n, v in enumerate(prod.get('hasVariant') or []):
            o = v.get('offers') or {}
            lab = v.get('name', '')
            lab = lab[len(base):].strip(' -–') if lab.startswith(base) else lab
            variants.append({'id': str(n + 1), 'label': lab or f'Varianta {n + 1}', 'czk': num(str(o.get('price', ''))),
                             'stock': 'InStock' in str(o.get('availability', '')), 'sku': v.get('sku')})
        prod = dict(prod, offers=(prod.get('hasVariant') or [{}])[0].get('offers', {}))
    off = prod.get('offers') or {}
    if isinstance(off, list): off = off[0] if off else {}
    imgs = prod.get('image') or []
    if isinstance(imgs, str): imgs = [imgs]
    crumbs = [e.get_text(' ', strip=True) for e in s.select('[itemtype*="BreadcrumbList"] [itemprop="name"]')]
    crumbs = list(dict.fromkeys(c for c in crumbs if c and c not in ('Úvod', 'Domů')))
    if crumbs and crumbs[-1] == prod.get('name'): crumbs = crumbs[:-1]
    if not crumbs and prod.get('category'): crumbs = [prod['category']]
    intro = s.select_one('#introduction-content')
    if intro:
        h = intro.find(['h2', 'h3'])
        if h and 'Představení' in h.get_text(): h.decompose()
    params = []
    for row in s.select('.parameters__property'):
        k = row.select_one('.parameters__property-title'); v = row.select_one('.parameters__property-content')
        if k and v: params.append((k.get_text(' ', strip=True), v.get_text(' ', strip=True)))
    desc = clean_html(intro)
    if params:
        desc += '<h3>Parametry</h3><table><tbody>' + ''.join(f'<tr><td>{k}</td><td>{v}</td></tr>' for k, v in params[:14]) + '</tbody></table>'
    brand = (prod.get('brand') or {}).get('name') if isinstance(prod.get('brand'), dict) else prod.get('brand')
    return dict(url=url, name=prod.get('name', ''), crumbs=crumbs, brand=brand, sku=prod.get('sku'),
                price=num(str(off.get('price', ''))), stock='InStock' in str(off.get('availability', '')),
                imgs=imgs[:8], short=prod.get('description', '').split('\n')[0][:300], desc=desc or ''.join(f'<p>{x}</p>' for x in prod.get('description', '').split('\n') if x.strip()),
                variants=variants, opt_label='Objem' if variants else None, params=dict(params),
                rating=(prod.get('aggregateRating') or {}).get('ratingValue'))


def parse_waterman(s, url):
    h1 = s.find('h1')
    name = h1.get_text(' ', strip=True) if h1 else ''
    if name and not name.lower().startswith('waterman'): name = 'Waterman ' + name
    txt = re.sub(r'\s+', ' ', s.get_text(' ', strip=True))
    m = re.search(r'Cena:\s*([\d ]+)\s*Kč', txt); price = num(m.group(1)) if m else None
    m = re.search(r'Cena s rytinou:\s*od\s*([\d ]+)\s*Kč', txt); engr = num(m.group(1)) if m else None
    m = re.search(r'Kód\s+(\d{3,5}/\w+)', txt); code = m.group(1) if m else None
    m = re.search(r'Barva laserového gravírování bude na tomto modelu .*? (zlatá|stříbrná|bílá|černá)', txt); ecol = m.group(1) if m else None
    imgs = []
    for a in s.select('a[href]'):
        hr = a['href']
        if re.search(r'Obrazky/Produkty/.*_v\.(jpe?g|png)$', hr, re.I):
            u = 'https://www.pera-waterman.cz/' + hr.lstrip('./')
            if u not in imgs: imgs.append(u)
    low = name.lower()
    typ = 'Plnicí pera' if 'plnicí' in low or 'plnici' in low else 'Rollery' if 'roller' in low else 'Kuličková pera' if 'kuličk' in low else 'Ostatní'
    ser = next((x for x in ['Exception', 'Carène', 'Expert', 'Hémisphère', 'Hemisphere', 'Perspective', 'Allure', 'Embleme', 'Graduate'] if x.lower() in low), None)
    if ser == 'Hemisphere': ser = 'Hémisphère'
    short = f"Luxusní {typ[:-1].lower() if typ.endswith('a') else typ.lower()} Waterman" if typ != 'Ostatní' else ''
    desc = ''
    if engr: desc += f'<p>Cena s laserovou rytinou od <strong>{engr} Kč</strong>. Dárková krabička v ceně.</p>'
    if ecol: desc += f'<p>Barva laserového gravírování na tomto modelu: <strong>{ecol}</strong>. Na přání nabízíme exkluzivní stříbření rytiny.</p>'
    desc += '<p>Rytinu si navrhnete přímo při objednávce – jméno, věnování nebo logo.</p>'
    return dict(url=url, name=name, crumbs=[typ] + ([ser] if ser else []), brand='Waterman', sku=code, price=price,
                stock='do 24 hodin' in txt.lower(), imgs=imgs[:6], short=short, desc=desc, variants=[], opt_label=None, engr=engr)


CATNAMES = {'kozene-brasny': 'Kožené brašny', 'kozene-aktovky': 'Kožené aktovky', 'kozene-kabelky': 'Kožené kabelky', 'kozene-kabely': 'Kožené kabely', 'kozene-batohy': 'Kožené batohy', 'kozene-penezenky': 'Kožené peněženky', 'kapsy-na-opasek': 'Kapsy na opasek', 'kozene-ledvinky': 'Kožené ledvinky', 'kozene-opasky': 'Kožené opasky', 'ostatni': 'Ostatní'}


res = []
for f in sorted(glob.glob(os.path.join(cache, '*.html'))):
    uf = f + '.url'
    url = open(uf).read().strip() if os.path.exists(uf) else ''
    s = BeautifulSoup(open(f, encoding='utf8', errors='replace'), 'lxml')
    try:
        r = {'upgates': parse_upgates, 'tatiana': parse_tatiana, 'jsonld': parse_jsonld, 'waterman': parse_waterman}.get(kind, parse_shoptet)(s, url)
    except Exception as e:
        print('ERR', url, e); continue
    if r['name'] and (r['price'] or r['variants']):
        res.append(r)
json.dump(res, open(out, 'w'), ensure_ascii=False, indent=0)
print(len(res), 'products ->', out)
