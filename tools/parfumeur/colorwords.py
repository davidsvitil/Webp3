"""Colour-word table shared by resolve_colors.py and name_colors.py."""
import re, unicodedata, colorsys


def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z]+', ' ', s).strip()


WORDS = [  # (word, hue deg, sat, light) – checked last word first
    ('amber', 30, .75, .4), ('ferrari', 355, .85, .45), ('oliva', 70, .45, .33), ('burgundy', 345, .6, .3), ('camel', 32, .5, .55), ('konakova', 22, .62, .36), ('cognac', 22, .62, .36), ('piskova', 36, .42, .62), ('taupe', 30, .12, .45),
    ('prirodni', 30, .45, .6), ('natural', 30, .45, .6), ('kastanova', 18, .5, .27), ('cokoladova', 20, .45, .2),
    ('karamelova', 28, .58, .45), ('medova', 35, .65, .5), ('vinova', 345, .55, .27), ('olivova', 70, .45, .33),
    ('smetanova', 40, .55, .88), ('koralova', 8, .8, .64), ('tmavehneda', 22, .45, .2), ('tan', 28, .5, .5),
    ('black', 0, 0, .08), ('cerna', 0, 0, .08), ('white', 0, 0, .97), ('bila', 0, 0, .97), ('grey', 0, 0, .55), ('gray', 0, 0, .55),
    ('seda', 0, 0, .55), ('silver', 210, .05, .75), ('stribrna', 210, .05, .75), ('chrome', 210, .05, .8), ('gold', 45, .7, .5),
    ('zlata', 45, .7, .5), ('copper', 22, .6, .45), ('medena', 22, .6, .45), ('bronze', 32, .5, .4), ('yellow', 50, .95, .55),
    ('yelow', 50, .95, .55), ('zluta', 50, .95, .55), ('lemon', 55, .95, .55), ('vanilla', 48, .8, .85), ('cream', 45, .7, .86),
    ('beige', 38, .4, .75), ('bezova', 38, .4, .75), ('sand', 38, .45, .7), ('orange', 25, .95, .53), ('oranzova', 25, .95, .53),
    ('red', 355, .85, .47), ('cervena', 355, .85, .47), ('ruby', 345, .8, .4), ('wine', 345, .7, .28), ('bordo', 345, .7, .28),
    ('pink', 330, .75, .72), ('ruzova', 330, .75, .72), ('magenta', 315, .8, .5), ('fuchsia', 315, .8, .5), ('rose', 340, .6, .7),
    ('violet', 275, .6, .45), ('fialova', 275, .6, .45), ('purple', 285, .6, .4), ('lilac', 275, .4, .7), ('lavender', 260, .45, .75),
    ('blue', 215, .8, .47), ('modra', 215, .8, .47), ('navy', 225, .7, .25), ('azure', 205, .8, .6), ('sky', 200, .7, .7),
    ('cyan', 190, .8, .5), ('turquoise', 175, .7, .45), ('tyrkysova', 175, .7, .45), ('petrol', 190, .7, .3), ('teal', 180, .6, .35),
    ('aqua', 180, .6, .6), ('mint', 150, .5, .75), ('green', 130, .6, .4), ('zelena', 130, .6, .4), ('lime', 85, .8, .5),
    ('olive', 70, .5, .35), ('khaki', 60, .3, .5), ('emerald', 150, .7, .35), ('brown', 25, .5, .3), ('hneda', 25, .5, .3),
    ('chocolate', 22, .5, .22), ('coffee', 25, .4, .3), ('ochre', 40, .7, .45), ('rust', 18, .6, .38), ('skin', 25, .5, .75),
    ('transparent', 0, 0, .9), ('clear', 0, 0, .9), ('lak', 0, 0, .9), ('neon', 90, 1, .55), ('fluor', 90, 1, .55),
]
MODS = {'light': .15, 'svetla': .15, 'svetle': .15, 'tmave': -.15, 'pastel': .2, 'pale': .2, 'dark': -.15, 'tmava': -.15, 'deep': -.12, 'bright': .05}
RAL = {'1': (48, .8, .5), '2': (25, .9, .5), '3': (355, .7, .4), '4': (300, .4, .4), '5': (215, .6, .38),
       '6': (130, .45, .32), '7': (210, .06, .5), '8': (25, .5, .28), '9': (0, 0, .5)}
RAL_FIX = {'9010': .95, '9016': .96, '9003': .96, '9001': .9, '9005': .07, '9006': .66, '9007': .55, '9011': .1, '9017': .1}


def hx(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, max(0, min(1, l)), s)
    return '#%02X%02X%02X' % (round(r * 255), round(g * 255), round(b * 255))


def by_words(label):
    n = norm(label)
    ws = n.split()
    m = re.search(r'ral\s*([1-9])(\d{3})', label.lower().replace('-', ' ').replace('  ', ' '))
    if m:
        k = m.group(1) + m.group(2)
        if k in RAL_FIX: return hx(0, 0, RAL_FIX[k])
        return hx(*RAL[m.group(1)])
    for w in reversed(ws):
        for word, h, s, l in WORDS:
            if w == word or (len(word) > 4 and w.startswith(word)):
                for mw, dl in MODS.items():
                    if mw in ws: l += dl
                # small deterministic spread so neighbouring shades of one family are distinguishable (still approximate)
                j = sum(map(ord, n)) % 9 - 4
                return hx((h + j * 2.5) % 360, s, l + (j * .012 if s else 0))
    return None
