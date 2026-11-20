/* Concept storefront (vanilla JS, hash router, CZK/EUR, localStorage cart) */
(async () => {
  'use strict';

  /* ---------- settings (per-shop, see js/shop.js) ---------- */
  const CFG = window.SHOP_CFG;
  const SHOP = CFG.shop;
  const PAGE = 24;
  const HERO = CFG.hero;
  const CAT_STYLE = CFG.catStyle;
  const FEATURED = CFG.featured;
  const BASE = CFG.base || ['#ff6a1a', '#2a0e02'];

  /* ---------- data ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const main = $('#main');
  main.innerHTML = '<section class="stage full"><div class="loading"><span class="script">loading…</span></div></section>';
  let DATA;
  try {
    DATA = await (await fetch('data/catalog.json', { cache: 'no-cache' })).json();
  } catch (e) {
    main.innerHTML = '<section class="stage full"><div class="loading">Katalog se nepodařilo načíst / Could not load catalogue.</div></section>';
    return;
  }
  const P = DATA.products;
  const byId = Object.fromEntries(P.map(p => [p.id, p]));
  const CATS = DATA.cats;
  const catOf = k => CATS.find(c => c.key === k);
  const subOf = p => p.sub && catOf(p.cat).subs.find(s => s.key === p.sub);
  const heroOf = id => HERO.find(h => h.id === id);
  const HEROES = HERO.filter(h => byId[h.id]);

  /* ---------- locale & currency ---------- */
  const I18N = window.MC_I18N; Object.assign(I18N.cs, CFG.i18n || {});
  const nav = (navigator.language || 'cs').toLowerCase();
  let LANG = 'cs';
  const NS = CFG.ns + '-';
  let CUR = localStorage.getItem(NS + 'cur') || 'CZK';
  const t = (k, vars) => {
    let s = (I18N[LANG] && I18N[LANG][k]) ?? I18N.cs[k] ?? k;
    if (vars && typeof s === 'string') for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, b);
    return s;
  };
  const L = o => (o && (o[LANG] || o.cs)) || '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = v => new Intl.NumberFormat(LANG === 'cs' ? 'cs-CZ' : 'en-IE', { style: 'currency', currency: CUR, minimumFractionDigits: CUR === 'CZK' ? 0 : 2, maximumFractionDigits: CUR === 'CZK' ? 0 : 2 }).format(v);
  const amount = (czk, eur) => CUR === 'CZK' ? czk : (eur ?? czk / DATA.rate);
  const money = (czk, eur) => fmt(amount(czk, eur));
  const czkMoney = czk => money(czk, czk / DATA.rate);
  const disp = n => CFG.dispStrip ? n.replace(new RegExp(CFG.dispStrip, 'i'), '') : n;
  const pName = p => L(p.name);
  const pad = n => String(n).padStart(2, '0');
  const shadesN = n => `${n} ${n === 1 ? t('shade1') : n > 1 && n < 5 ? t('shades24') : t('shades')}`;
  const root = document.documentElement;

  function setColors(a, b) {
    root.style.setProperty('--c1', a);
    root.style.setProperty('--c2', b);
    $('meta[name="theme-color"]').setAttribute('content', b);
  }
  const colorsFor = p => heroOf(p.id)?.grad || (p.col ? [p.col, p.col2 ? darken(p.col2, .32) : darken(p.col, .18)] : [CAT_STYLE[p.cat]?.a || BASE[0], CAT_STYLE[p.cat]?.b || BASE[1]]);
  const darken = (hex, f = .2) => {
    const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(x => Math.round(x * f).toString(16).padStart(2, '0')).join('');
  };
  const priceHtml = p => p.czk ? `${p.from ? `<small>${t('from')}</small>` : ''}${money(p.czk, p.eur)}${p.reg ? ` <s class="old">${money(p.reg.czk, p.reg.eur)}</s>` : ''}` : `<small>${t('priceOnRequest')}</small>`;
  const swatchBg = v => v.g ? `linear-gradient(135deg, ${v.h} 0%, ${v.g} 100%)` : v.h;

  /* ---------- cart ---------- */
  const lineOf = i => {
    const p = byId[i.id];
    const v = i.v ? p.var?.find(x => x.v === i.v) : null;
    const o = v ? p.opt.values.find(x => x.id === v.o) : null;
    return { p, v, o, czk: v ? v.czk : p.czk, eur: v ? v.eur : p.eur, max: v ? v.q : 99 };
  };
  const Cart = {
    items: JSON.parse(localStorage.getItem(NS + 'cart') || '[]').filter(i => byId[i.id] && (!i.v || byId[i.id].var?.some(x => x.v === i.v))),
    save() { localStorage.setItem(NS + 'cart', JSON.stringify(this.items)); renderBadge(); },
    add(id, qty = 1, v = null) {
      const hit = this.items.find(i => i.id === id && i.v === v);
      const max = lineOf({ id, v }).max || 99;
      if (hit) hit.qty = Math.min(max, hit.qty + qty); else this.items.push({ id, v, qty: Math.min(max, qty) });
      this.save();
      const b = $('#cartCount'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
      toast(`${t('added')} · ${disp(pName(byId[id]))}`);
    },
    set(idx, qty) {
      const max = lineOf(this.items[idx]).max || 99;
      if (qty < 1) this.items.splice(idx, 1); else this.items[idx].qty = Math.min(max, qty);
      this.save(); renderDrawer();
    },
    count() { return this.items.reduce((s, i) => s + i.qty, 0); },
    totalCZK() { return this.items.reduce((s, i) => s + lineOf(i).czk * i.qty, 0); },
    total() { return this.items.reduce((s, i) => { const l = lineOf(i); return s + amount(l.czk, l.eur) * i.qty; }, 0); },
  };
  const renderBadge = () => { $('#cartCount').textContent = Cart.count(); };

  let toastT;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ---------- chrome: pill menu & switches ---------- */
  const pill = $('#pill'), menuBtn = $('#menuBtn');
  const switches = () => `
    <div class="switch" role="group" aria-label="${t('currency')}"><button data-cur="CZK" class="${CUR === 'CZK' ? 'on' : ''}">Kč</button><button data-cur="EUR" class="${CUR === 'EUR' ? 'on' : ''}">€</button></div>`;
  function renderChrome() {
    root.lang = LANG;
    $('.skip').textContent = t('skip');
    $('#cartBtn').setAttribute('aria-label', t('cart'));
    $('#drawerTitle').textContent = t('cart');
    const ico = CFG.catIco || {};
    $('#pillMenu').innerHTML = `
      <a href="#/shop" class="tile wide">${t('shop')} <span class="chev">›</span></a>
      ${CATS.map(c => `<a href="#/shop/${c.key}" class="tile"><span class="ico">${ico[c.key] || '•'}</span>${esc(L(c))}</a>`).join('')}
      <a href="#/o-nas" class="tile"><span class="ico">i</span>${t('about')}</a>
      <a href="#/kontakt" class="tile"><span class="ico">✉</span>${t('contact')}</a>
      ${switches()}
      <div class="pill-menu-foot"><span>© 2026 ${esc(SHOP.name)}</span>${SHOP.instagram ? `<a href="${SHOP.instagram}" target="_blank" rel="noopener">${esc(SHOP.igHandle || "Instagram")}</a>` : ""}</div>`;
  }
  function toggleMenu(force) {
    const open = force ?? !pill.classList.contains('open');
    pill.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', open);
  }
  menuBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', e => {
    const lb = e.target.closest('[data-lang]'), cb = e.target.closest('[data-cur]');
    if (lb) {
      e.preventDefault();
      const was = LANG; LANG = lb.dataset.lang; localStorage.setItem('mc-lang', LANG);
      if (!localStorage.getItem('mc-cur-set') && was !== LANG) { CUR = LANG === 'cs' ? 'CZK' : 'EUR'; localStorage.setItem('mc-cur', CUR); }
      rerender(); return;
    }
    if (cb) { e.preventDefault(); CUR = cb.dataset.cur; localStorage.setItem(NS + 'cur', CUR); rerender(); return; }
    if (!pill.contains(e.target)) toggleMenu(false);
  });
  function rerender() {
    const y = window.scrollY, open = pill.classList.contains('open');
    renderChrome(); route(true); renderDrawer();
    if (open) toggleMenu(true);
    window.scrollTo(0, y);
  }

  /* ---------- drawer ---------- */
  const drawer = $('#drawer'), scrim = $('#scrim');
  function openDrawer() {
    renderDrawer(); scrim.hidden = false;
    requestAnimationFrame(() => { scrim.classList.add('show'); drawer.classList.add('open'); });
    drawer.setAttribute('aria-hidden', 'false'); toggleMenu(false);
    setTimeout(() => $('#drawerClose').focus(), 50);
  }
  function closeDrawer() {
    scrim.classList.remove('show'); drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
    setTimeout(() => { scrim.hidden = true; }, 300);
  }
  $('#cartBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  let checkoutStep = false;
  function renderDrawer() {
    const body = $('#drawerBody');
    if (!Cart.items.length) {
      checkoutStep = false;
      body.innerHTML = `<div class="drawer-empty"><span class="script">${t('emptyCart')}</span><p>${t('emptyCartText')}</p><a class="btn" href="#/shop" data-close>${t('toShop')}</a></div>`;
      return;
    }
    const tc = Cart.totalCZK();
    const left = SHOP.freeShipCZK ? Math.max(0, SHOP.freeShipCZK - tc) : 0;
    const lines = Cart.items.map((i, idx) => {
      const { p, o, czk, eur } = lineOf(i);
      return `<div class="line">
        <img src="${p.img[0] || ''}" alt="" loading="lazy">
        <div><a class="line-name" href="#/p/${p.id}" data-close>${esc(disp(pName(p)))}</a>
          ${o ? `<div class="line-var">${o.h ? `<i class="dot" style="background:${swatchBg(o)}"></i>` : ''}${esc(o.n || o.l)}${o.c ? ` · ${esc(o.c)}` : ''}</div>` : ''}
          <div class="qty"><button data-q="${idx}" data-d="-1" aria-label="${t('less')}">−</button><input value="${i.qty}" readonly aria-label="${t('qty')}"><button data-q="${idx}" data-d="1" aria-label="${t('more')}">+</button></div></div>
        <div class="line-right"><b>${fmt(amount(czk, eur) * i.qty)}</b><button class="line-del" data-del="${idx}">${t('remove')}</button></div>
      </div>`;
    }).join('');
    body.innerHTML = `${lines}
      ${SHOP.freeShipCZK ? `<div class="ship">${left ? `${t('toFree')} <b>${czkMoney(left)}</b>` : `<b>${t('freeShip')}</b> – ${t('freeShipHave')}`}
        <div class="bar"><i style="width:${Math.min(100, tc / SHOP.freeShipCZK * 100)}%"></i></div></div>` : ''}
      ${SHOP.discountCZK && tc >= SHOP.discountCZK ? `<p class="fine">${t('discountNote', { amount: czkMoney(SHOP.discountCZK) })}</p>` : ''}
      <div class="sum"><span>${t('subtotal')}</span><b>${fmt(Cart.total())}</b></div>
      ${checkoutStep ? checkoutForm() : `<button class="btn accent" id="goCheckout">${t('continue')}</button>
      <p class="fine" style="margin-top:12px">${t('priceNote')}</p>`}`;
  }
  function checkoutForm() {
    return `<form class="checkout" id="checkout">
      <input class="field" name="name" placeholder="${t('name')}" required autocomplete="name">
      <input class="field" name="email" type="email" placeholder="${t('email')}" required autocomplete="email">
      <input class="field" name="phone" type="tel" placeholder="${t('phone')}" required autocomplete="tel">
      <div class="radios">
        ${SHOP.pickup ? `<label class="radio"><input type="radio" name="ship" value="${t('pickup')}" checked> ${t('pickup')} <span>${t('free')}</span></label>` : ''}
        <label class="radio"><input type="radio" name="ship" value="${t('delivery')}" ${SHOP.pickup ? '' : 'checked'}> ${t('delivery')} <span>${SHOP.freeShipCZK && Cart.totalCZK() >= SHOP.freeShipCZK ? t('free') : t('byTariff')}</span></label>
      </div>
      <textarea class="field" name="addr" placeholder="${t('address')}"></textarea>
      <div class="radios">
        <label class="radio"><input type="radio" name="pay" value="${t('bank')}" checked> ${t('bank')}</label>
        <label class="radio"><input type="radio" name="pay" value="${t('cod')}"> ${t('cod')}</label>
      </div>
      <label class="fine"><input type="checkbox" required> ${t('agree')} <a class="link" href="${SHOP.terms}" target="_blank" rel="noopener">${t('agreeTerms')}</a>.</label>
      <button class="btn accent" type="submit">${t('send')}</button>
      <p class="fine">${t('sendNote', { email: SHOP.email })}</p>
    </form>`;
  }
  $('#drawerBody').addEventListener('click', e => {
    const q = e.target.closest('[data-q]');
    if (q) { const i = +q.dataset.q; Cart.set(i, Cart.items[i].qty + +q.dataset.d); return; }
    const d = e.target.closest('[data-del]');
    if (d) { Cart.set(+d.dataset.del, 0); return; }
    if (e.target.id === 'goCheckout') { checkoutStep = true; renderDrawer(); $('#checkout input').focus(); return; }
    if (e.target.closest('[data-close]')) closeDrawer();
  });
  $('#drawerBody').addEventListener('submit', e => {
    if (e.target.id !== 'checkout') return;
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const rows = Cart.items.map(i => {
      const { p, o, czk, eur } = lineOf(i);
      return `• ${i.qty}× ${pName(p)}${o ? ` – ${o.n || o.l}${o.c ? ` (${o.c})` : ''}` : ''} [#${i.v || p.pid}] – ${fmt(amount(czk, eur) * i.qty)}`;
    }).join('\n');
    const text = `${t('mailHello')}\n\n${rows}\n\n${t('subtotal')}: ${fmt(Cart.total())} (${t('mailCur')}: ${CUR})\n${t('mailShip')}: ${f.ship}\n${t('mailPay')}: ${f.pay}\n\n${t('name')}: ${f.name}\n${t('email')}: ${f.email}\n${t('phone')}: ${f.phone}\n${t('mailNote')}: ${f.addr || '–'}\n\n${t('mailThanks')}`;
    location.href = `mailto:${SHOP.email}?subject=${encodeURIComponent(t('mailSubject') + ' – ' + f.name)}&body=${encodeURIComponent(text)}`;
    toast(t('opening'));
  });

  /* ---------- shared blocks ---------- */
  const swatchStrip = p => {
    if (p.opt?.type !== 'color') return '';
    const n = p.opt.values.length;
    return `<span class="strip" aria-label="${shadesN(n)}">${p.opt.values.slice(0, 7).map(v => `<i style="background:${swatchBg(v)}"></i>`).join('')}${n > 7 ? `<em>+${n - 7}</em>` : ''}</span>`;
  };
  const card = p => {
    const sub = subOf(p);
    const out = !p.stock;
    const quick = p.czk && !p.var && !out;
    return `<article class="card ${out ? 'out' : ''}">
      <a class="card-img" href="#/p/${p.id}">${p.img[0] ? `<img src="${p.img[0]}" alt="${esc(pName(p))}" loading="lazy">` : ''}${out ? `<span class="flag">${t('soldOut')}</span>` : p.reg ? '<span class="flag sale">Sale</span>' : ''}</a>
      <div class="card-body">
        <span class="card-tag">${esc(sub ? L(sub) : L(catOf(p.cat)))}</span>
        <a class="card-name" href="#/p/${p.id}">${esc(disp(pName(p)))}</a>
        ${swatchStrip(p)}
        ${p.opt?.type === 'size' ? `<span class="sizes">${p.opt.values.map(v => esc(v.l)).join(' · ')}</span>` : ''}
        <div class="card-price"><span>${priceHtml(p)}</span>${quick ? `<button class="add" data-add="${p.id}" aria-label="${t('addToCart')}: ${esc(pName(p))}">+</button>` : `<a class="add ghosty" href="#/p/${p.id}" aria-label="${esc(pName(p))}">›</a>`}</div>
      </div></article>`;
  };

  const ticker = () => {
    const items = t('ticker').map(s => s.replace('{free}', czkMoney(SHOP.freeShipCZK || 0)).replace('{disc}', czkMoney(SHOP.discountCZK || 0)));
    const row = items.map(x => `<span>${esc(x)}</span>`).join('');
    return `<div class="ticker" aria-label="${esc(items.join(', '))}"><div class="ticker-track" aria-hidden="true">${row}${row}</div></div>`;
  };

  const footer = () => `
    <section class="stage plain"><div class="stage-inner news" style="padding-top:var(--pad)">
      <div><span class="eyebrow">${t('mailing')}</span><div class="sec-head" style="margin:6px 0 0"><h2>${t('newShades')} <span class="script">${t('first')}</span></h2></div>
      <p style="color:var(--ink-2);margin:10px 0 0">${t('mailingText')}</p></div>
      <form id="nlForm" data-mail="${esc(SHOP.info)}">
        <label class="sr" for="nl">E-mail</label>
        <input class="field" id="nl" type="email" name="EMAIL" placeholder="vas@email.cz" required>
        <button class="btn" type="submit">${t('subscribe')}</button>
      </form>
    </div></section>
    <footer class="stage plain"><div class="stage-inner" style="padding-top:var(--pad)">
      <div class="footer">
        <div><img class="logo" src="assets/img/logo.svg" alt="${esc(SHOP.name)}"><p style="margin:0;max-width:34ch">${t('footerAbout')}</p><div class="switches">${switches()}</div></div>
        <div><h4>${t('shop')}</h4><ul>${CATS.map(c => `<li><a href="#/shop/${c.key}">${esc(L(c))}</a></li>`).join('')}</ul></div>
        <div><h4>${t('info')}</h4><ul><li><a href="#/o-nas">${t('about')}</a></li><li><a href="#/kontakt">${t('contactPickup')}</a></li><li><a href="${SHOP.terms}" target="_blank" rel="noopener">${t('terms')}</a></li>${SHOP.instagram ? `<li><a href="${SHOP.instagram}" target="_blank" rel="noopener">Instagram</a></li>` : ''}<li><a href="${SHOP.official}" target="_blank" rel="noopener">${t('officialShop')}</a></li></ul></div>
        <div><h4>${t('contact')}</h4><ul><li><a href="tel:${SHOP.phoneRaw}">${SHOP.phone}</a></li><li><a href="mailto:${SHOP.info}">${SHOP.info}</a></li><li>${SHOP.addrShort}</li><li>${SHOP.hoursShort}</li></ul></div>
        <div class="footer-bottom"><span>© 2026 ${SHOP.legal}</span><span>${t('vatIncl')}${CUR === 'EUR' ? ` · 1 € ≈ ${DATA.rate.toFixed(2)} Kč` : ''}</span></div>
      </div>
      <div class="mega" aria-hidden="true">${esc(CFG.mega)}</div>
    </div></footer>`;

  /* ---------- views ---------- */
  let cleanup = null;
  let heroIndex = 0;

  function viewHome() {
    let cur = heroIndex;
    const count = k => P.filter(p => p.cat === k).length;
    const featured = FEATURED.map(id => byId[id]).filter(Boolean);
    main.innerHTML = `
      <section class="stage full hero" aria-roledescription="carousel">
        <div class="hero-top">
          <div class="chips"><a class="chip on" href="#/shop">${t('all')} <small>${P.length}</small></a>${CATS.map(c => `<a class="chip" href="#/shop/${c.key}">${esc(L(c))} <small>${count(c.key)}</small></a>`).join('')}</div>
          <div class="counter" id="counter"></div>
        </div>
        <div class="ghost-word" id="ghost" aria-hidden="true"></div>
        <div class="track" id="track">
          ${HEROES.map((h, i) => `<div class="slide${h.img ? '' : ' photo'}" data-i="${i}"><img src="${h.img || byId[h.id].img[0]}" alt="${esc(pName(byId[h.id]))}" ${i > 2 ? 'loading="lazy"' : ''}></div>`).join('')}
        </div>
        <div class="hero-foot">
          <div id="heroText" aria-live="polite"></div>
          <div class="hero-ctrl">
            <button class="round" id="prev" aria-label="${t('prev')}">‹</button>
            <button class="round" id="next" aria-label="${t('next')}">›</button>
            <a class="btn" id="discover" href="#/shop">${t('discover')} ›</a>
          </div>
        </div>
      </section>
      ${ticker()}
      <section class="stage plain"><div class="stage-inner" style="padding-top:var(--pad)">
        <div class="sec-head"><div><span class="eyebrow">${t('categories')}</span><h2>${t('pickWeapon')} <span class="script">${t('weapon')}</span></h2></div><a class="btn ghost" href="#/shop">${t('wholeRange')} ›</a></div>
        <div class="cats">
          ${CATS.map((c, i) => { const s = CAT_STYLE[c.key] || {}; return `<a class="cat ${i === 0 || i === CATS.length - 1 ? 'big' : ''}" href="#/shop/${c.key}" style="--a:${s.a};--b:${s.b}">
            <span class="chev">›</span><div><span>${esc(s.sub || '')}</span><br><b>${esc(L(c))}</b><br><span class="cnt">${count(c.key)} ${t('products')}</span></div>${s.img ? `<img src="${s.img}" alt="" loading="lazy">` : ''}</a>`; }).join('')}
        </div>
      </div></section>
      <section class="stage light"><div class="stage-inner" style="padding-top:var(--pad)">
        <div class="sec-head"><div><span class="eyebrow">${t('freshPick')}</span><h2>${t('freshDrop')} <span class="script" style="color:#141210">${t('drop')}</span></h2></div><a class="btn dark" href="#/shop">${t('shop')} ›</a></div>
        <div class="grid">${featured.map(card).join('')}</div>
      </div></section>
      <section class="stage"><div class="stage-inner story" style="padding-top:var(--pad)">
        <div class="big-year" aria-hidden="true">${CFG.year}</div>
        <div>
          <span class="eyebrow" style="color:var(--ink-2)">${t('storyEyebrow')}</span>
          <div class="sec-head" style="margin:6px 0 18px"><h2>${t('storyTitle')} <span class="script">${t('storyScript')}</span></h2></div>
          <p>${t('storyText')}</p>
          <a class="btn" href="#/o-nas" style="margin-top:10px">${t('ourStory')} ›</a>
        </div>
      </div></section>
      <section class="perks">
        <div class="perk"><span class="num">01</span><b>${t('perk1')}</b><p>${t('perk1t')}</p></div>
        <div class="perk"><span class="num">02</span><b>${t('perk2')}</b><p>${t('perk2t', { amount: czkMoney(SHOP.freeShipCZK || 0) })}</p></div>
        <div class="perk"><span class="num">03</span><b>${t('perk3')}</b><p>${t('perk3t', { amount: czkMoney(SHOP.discountCZK || 0) })}</p></div>
        <div class="perk"><span class="num">04</span><b>${t('perk4')}</b><p>${t('perk4t')}</p></div>
      </section>
      ${footer()}`;

    const track = $('#track'), slides = $$('.slide', track);
    function layout() {
      const w = track.clientWidth;
      const step = w < 600 ? w * 0.36 : Math.min(w * 0.24, 340);
      const n = HEROES.length;
      slides.forEach((s, i) => {
        let d = i - cur;
        if (d > n / 2) d -= n;
        if (d < -n / 2) d += n;
        const ad = Math.abs(d);
        s.style.setProperty('--off', d === 0 ? 0 : Math.sign(d) * (step * (ad === 1 ? 1 : ad === 2 ? 1.75 : 2.4)));
        s.style.setProperty('--s', ad === 0 ? 1 : ad === 1 ? .62 : ad === 2 ? .46 : .3);
        s.style.setProperty('--o', ad > 2 ? 0 : ad === 2 ? .7 : 1);
        s.style.zIndex = 10 - ad;
        s.classList.toggle('is-center', d === 0);
        s.setAttribute('aria-hidden', d !== 0);
      });
    }
    function show(i) {
      cur = heroIndex = (i + HEROES.length) % HEROES.length;
      const h = HEROES[cur], p = byId[h.id], sub = subOf(p);
      setColors(...h.grad);
      layout();
      const g = $('#ghost'); g.classList.add('swap');
      setTimeout(() => { g.textContent = h.word; g.classList.remove('swap'); }, 200);
      $('#counter').textContent = `${pad(cur + 1)} / ${pad(HEROES.length)}`;
      $('#heroText').innerHTML = `<div class="fade-up"><span class="eyebrow" style="color:var(--ink-2)">${esc(L(catOf(p.cat)))}${sub ? ' · ' + esc(L(sub)) : ''}${p.opt?.type === 'color' ? ` · ${shadesN(p.opt.values.length)}` : ''}</span>
        <h1 class="hero-title">${esc(disp(pName(p)))}</h1><span class="hero-script script">${esc(h.script)}</span>
        <div class="hero-price">${p.from ? t('from') + ' ' : ''}<b>${money(p.czk, p.eur)}</b></div></div>`;
      $('#discover').href = `#/p/${p.id}`;
    }
    $('#prev').onclick = () => show(cur - 1);
    $('#next').onclick = () => show(cur + 1);
    track.addEventListener('click', e => {
      const s = e.target.closest('.slide'); if (!s) return;
      const i = +s.dataset.i;
      if (i === cur) location.hash = `#/p/${HEROES[i].id}`; else show(i);
    });
    let sx = null;
    track.addEventListener('pointerdown', e => { sx = e.clientX; });
    track.addEventListener('pointerup', e => { if (sx !== null && Math.abs(e.clientX - sx) > 40) show(cur + (e.clientX < sx ? 1 : -1)); sx = null; });
    const onKey = e => { if (e.target.closest('input,textarea,select')) return; if (e.key === 'ArrowRight') show(cur + 1); if (e.key === 'ArrowLeft') show(cur - 1); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', layout);
    show(cur);
    $('#ghost').textContent = HEROES[cur].word;
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', layout); };
  }

  const shopState = { q: '', sort: 'rec', stock: false, shown: PAGE, key: '' };
  function viewShop(catKey, subKey) {
    const c = catOf(catKey);
    const s = c && subKey ? c.subs.find(x => x.key === subKey) : null;
    const st = CAT_STYLE[catKey];
    setColors(...(st ? [st.a, st.b] : BASE));
    const key = `${catKey}/${subKey}`;
    if (shopState.key !== key) { shopState.key = key; shopState.shown = PAGE; }
    const subsWithItems = c ? c.subs.filter(x => P.some(p => p.cat === c.key && p.sub === x.key)) : [];
    main.innerHTML = `
      <section class="stage full"><div class="stage-inner">
        <div class="shop-head"><span class="eyebrow" style="color:var(--ink-2)">${t('shop')} · ${c ? esc(st?.sub || '') : t('wholeRange')}</span>
          <h1>${c ? esc(s ? L(s) : L(c)) : t('all')}<span class="script">${c ? esc(CFG.shopScript || '') + ' ' + esc(L(c)).toLowerCase() : t('forCulture')}</span></h1></div>
        <div class="toolbar">
          <div class="chips"><a class="chip ${!c ? 'on' : ''}" href="#/shop">${t('all')} <small>${P.length}</small></a>
            ${CATS.map(x => `<a class="chip ${c && c.key === x.key ? 'on' : ''}" href="#/shop/${x.key}">${esc(L(x))} <small>${P.filter(p => p.cat === x.key).length}</small></a>`).join('')}</div>
          <div class="tools">
            <label class="sr" for="q">${t('search')}</label><input class="field" id="q" type="search" placeholder="${t('search')}" value="${esc(shopState.q)}">
            <label class="sr" for="sort">${t('sort')}</label>
            <select class="field" id="sort">${[['rec', 'sortRec'], ['asc', 'sortAsc'], ['desc', 'sortDesc'], ['az', 'sortAz']].map(([v, k]) => `<option value="${v}" ${shopState.sort === v ? 'selected' : ''}>${t(k)}</option>`).join('')}</select>
          </div>
        </div>
        ${subsWithItems.length > 1 ? `<div class="chips subchips">
          <a class="chip soft ${!s ? 'on' : ''}" href="#/shop/${c.key}">${t('all')}</a>
          ${subsWithItems.map(x => `<a class="chip soft ${s && s.key === x.key ? 'on' : ''}" href="#/shop/${c.key}/${x.key}">${esc(L(x))} <small>${P.filter(p => p.cat === c.key && p.sub === x.key).length}</small></a>`).join('')}</div>` : ''}
        <label class="toggle"><input type="checkbox" id="stockOnly" ${shopState.stock ? 'checked' : ''}> ${t('onlyStock')}</label>
        <div class="grid" id="grid"></div>
        <div class="more" id="more"></div>
      </div></section>
      ${ticker()}${footer()}`;
    const norm = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const draw = () => {
      const q = norm(shopState.q.trim());
      const list = P.filter(p => (!c || p.cat === c.key) && (!s || p.sub === s.key) && (!shopState.stock || p.stock)
        && (!q || norm(`${p.name.cs} ${p.kw || ''} ${p.brand || ''} ${p.sku || ''} ${p.opt?.type === 'color' ? p.opt.values.map(v => `${v.n} ${v.c}`).join(' ') : ''}`).includes(q)));
      if (shopState.sort === 'rec') list.sort((a, b) => (!!b.stock - !!a.stock) || ((heroOf(b.id) ? 1 : 0) - (heroOf(a.id) ? 1 : 0)));
      if (shopState.sort === 'asc') list.sort((a, b) => amount(a.czk, a.eur) - amount(b.czk, b.eur));
      if (shopState.sort === 'desc') list.sort((a, b) => amount(b.czk, b.eur) - amount(a.czk, a.eur));
      if (shopState.sort === 'az') list.sort((a, b) => disp(pName(a)).localeCompare(disp(pName(b)), LANG));
      $('#grid').innerHTML = list.length ? list.slice(0, shopState.shown).map(card).join('') : `<p class="empty" style="grid-column:1/-1">${t('nothing')}</p>`;
      const rest = list.length - shopState.shown;
      $('#more').innerHTML = rest > 0 ? `<button class="btn ghost" id="moreBtn">${t('showMore')} (${rest})</button>` : '';
    };
    $('#q').addEventListener('input', e => { shopState.q = e.target.value; shopState.shown = PAGE; draw(); });
    $('#sort').addEventListener('change', e => { shopState.sort = e.target.value; draw(); });
    $('#stockOnly').addEventListener('change', e => { shopState.stock = e.target.checked; shopState.shown = PAGE; draw(); });
    $('#more').addEventListener('click', e => { if (e.target.id === 'moreBtn') { shopState.shown += PAGE; draw(); } });
    draw();
  }

  function viewProduct(id, vParam) {
    const p = byId[id];
    if (!p) return viewNotFound();
    const hero = heroOf(p.id);
    setColors(...colorsFor(p));
    const c = catOf(p.cat), sub = subOf(p);
    const sib = P.filter(x => x.cat === p.cat && (!p.sub || x.sub === p.sub));
    const k = sib.indexOf(p);
    const prev = sib[(k - 1 + sib.length) % sib.length], next = sib[(k + 1) % sib.length];
    const related = sib.filter(x => x !== p && x.stock).slice(0, 5);
    const isColor = p.opt?.type === 'color';
    let sel = p.var?.find(x => String(x.v) === vParam) || null;
    const optFor = v => p.opt.values.find(o => o.id === v.o);
    const desc = L(p.desc) || p.desc.cs;
    const shortTxt = (L(p.short) || p.short.cs).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const thumbs = (hero && hero.img ? [{ src: hero.img, hero: 1 }] : []).concat(p.img.map(src => ({ src })));

    const picker = !p.opt ? '' : isColor ? `
      <div class="picker">
        <div class="picker-head"><b>${shadesN(p.opt.values.length)}</b><input class="field" id="shadeQ" type="search" placeholder="${t('searchShades')}" aria-label="${t('searchShades')}"></div>
        <div class="swatches" id="swatches" role="listbox" aria-label="${esc(L(p.opt.label))}">
          ${p.var.map(v => { const o = optFor(v); return `<button class="sw ${v.q ? '' : 'na'}" role="option" data-v="${v.v}" data-k="${esc(`${o.n || ''} ${o.c || ''} ${o.l}`.toLowerCase())}" style="--sw:${swatchBg(o)}" title="${esc(o.n || o.l)}${o.c ? ' · ' + esc(o.c) : ''}${v.q ? '' : ' – ' + t('soldOut')}" aria-label="${esc(o.n || o.l)} ${esc(o.c || '')}" ${v.q ? '' : 'aria-disabled="true"'}></button>`; }).join('')}
        </div>
        <div class="sel" id="selInfo"></div>
      </div>` : `
      <div class="picker"><div class="picker-head"><b>${esc(L(p.opt.label))}</b></div>
        <div class="sizes-pick">${p.var.map(v => `<button class="chip soft ${v.q ? '' : 'na'}" data-v="${v.v}" ${v.q ? '' : 'disabled'}>${esc(optFor(v).l)}</button>`).join('')}</div>
        <div class="sel" id="selInfo"></div></div>`;

    main.innerHTML = `
      <section class="stage full"><div class="pd">
        <div class="pd-tabs">
          <a class="chip soft" href="#/shop/${p.cat}${p.sub ? '/' + p.sub : ''}">‹ ${t('back')}</a>
          <button class="chip soft on" data-tab="overview">${t('overview')}</button>
          ${desc ? `<button class="chip soft" data-tab="desc">${t('description')}</button>` : ''}
          <button class="chip soft" data-tab="details">${t('details')}</button>
        </div>
        <div class="pd-info">
          <span class="eyebrow" style="color:var(--ink-2)">${esc(L(c))}${sub ? ' · ' + esc(L(sub)) : ''}</span>
          <h1>${esc(disp(pName(p)))}</h1>
          <span class="hero-script script">${esc(hero ? hero.script : (sub ? L(sub) : L(c)))}</span>
          <div id="tab-overview">
            ${shortTxt ? `<p class="pd-desc">${esc(shortTxt)}</p>` : ''}
            ${picker}
            ${!p.opt ? `<div class="chips">${p.brand ? `<span class="chip soft">${esc(p.brand)}</span>` : ''}<span class="chip soft">${p.stock ? t('inStock') : t('soldOut')}</span>${SHOP.pickup ? `<span class="chip soft">${t('pickupChip')}</span>` : ''}</div>` : ''}
          </div>
          <div id="tab-desc" class="rich" hidden>${desc}${p.noEn && LANG === 'en' ? `<p class="pd-note">${t('noEn')}</p>` : ''}</div>
          <div id="tab-details" hidden>
            <table class="spec"><tbody>
              ${p.brand ? `<tr><td>${t('brand')}</td><td>${esc(p.brand)}</td></tr>` : ''}
              <tr><td>${t('category')}</td><td>${esc(L(c))}${sub ? ' · ' + esc(L(sub)) : ''}</td></tr>
              <tr><td>${t('price')}</td><td>${p.from ? t('from') + ' ' : ''}${money(p.czk, p.eur)} ${t('vat')}</td></tr>
              ${p.opt ? `<tr><td>${t('variants')}</td><td>${p.opt.values.length} · ${esc(L(p.opt.label))}</td></tr>` : ''}
              <tr><td>${t('shipping')}</td><td>${t('shippingVal', { amount: czkMoney(SHOP.freeShipCZK || 0) })}</td></tr>
              ${p.sku ? `<tr><td>${t('code')}</td><td>${esc(p.sku)}</td></tr>` : ''}
            </tbody></table>
            ${p.dl.map(u => `<p><a class="link" href="${esc(u)}" target="_blank" rel="noopener">${t('safety')} ›</a></p>`).join('')}
            <p><a class="link" href="${esc(p.src)}" target="_blank" rel="noopener">${t('onOfficial')} ›</a></p>
          </div>
        </div>
        <div class="pd-media">
          <img id="mainImg" ${hero && hero.img ? '' : 'class="boxed"'} src="${thumbs[0]?.src || ''}" alt="${esc(pName(p))}">
          ${thumbs.length > 1 ? `<div class="thumbs">${thumbs.map((th, i) => `<button class="thumb ${i === 0 ? 'on' : ''}" data-img="${th.src}" ${th.hero ? 'data-hero="1"' : ''} aria-label="${i + 1}"><img src="${th.src}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
        </div>
        <div class="pd-buy">
          <div class="pd-price" id="pdPrice"></div>
          <div class="qty"><button data-step="-1" aria-label="${t('less')}">−</button><input id="qty" type="number" min="1" value="1" aria-label="${t('qty')}"><button data-step="1" aria-label="${t('more')}">+</button></div>
          <button class="btn accent" id="buy"></button>
          <div class="pd-nav"><a class="round" href="#/p/${prev.id}" aria-label="${t('prev')}">‹</a><a class="round" href="#/p/${next.id}" aria-label="${t('next')}">›</a></div>
        </div>
      </div></section>
      ${related.length ? `<section class="stage plain"><div class="stage-inner" style="padding-top:var(--pad)">
        <div class="sec-head"><div><span class="eyebrow">${t('related')}</span><h2>${t('fromLine')} <span class="script">${t('line')}</span></h2></div></div>
        <div class="grid">${related.map(card).join('')}</div></div></section>` : ''}
      ${footer()}`;

    const buy = $('#buy');
    function update() {
      const price = sel ? { czk: sel.czk, eur: sel.eur } : { czk: p.czk, eur: p.eur };
      $('#pdPrice').innerHTML = `${!sel && p.from ? `<small>${t('from')}</small>` : ''}${money(price.czk, price.eur)}${!p.var && p.reg ? ` <s class="old">${money(p.reg.czk, p.reg.eur)}</s>` : ''}`;
      const needs = !!p.var && !sel;
      const out = sel ? !sel.q : !p.var && !p.stock;
      buy.disabled = needs || out || !p.czk;
      buy.textContent = out ? t('soldOut') : needs ? (isColor ? t('chooseColor') : t('chooseSize')) : t('addToCart');
      const q = $('#qty'); q.max = sel ? sel.q : 99; if (sel && +q.value > sel.q) q.value = Math.max(1, sel.q);
      if (!p.opt) return;
      $$('[data-v]').forEach(b => b.classList.toggle('on', !!sel && +b.dataset.v === sel.v));
      const info = $('#selInfo');
      if (sel) {
        const o = optFor(sel);
        info.innerHTML = `${isColor ? `<i class="dot lg" style="background:${swatchBg(o)}"></i>` : ''}<div><b>${esc(o.n || o.l)}</b>${o.c ? ` <span>${esc(o.c)}</span>` : ''}<br><small>${sel.q ? (sel.q >= 99 ? t('inStock') : (sel.q <= 3 ? t('lastPieces') + ' · ' : '') + t('stockLeft', { n: sel.q })) : t('soldOut')}</small></div>`;
        if (isColor && o.h) setColors(o.h, darken(o.h, .18));
      } else info.innerHTML = `<small>${isColor ? t('chooseColor') : t('chooseSize')}</small>`;
    }
    if (p.opt) {
      $('.picker').addEventListener('click', e => {
        const b = e.target.closest('[data-v]'); if (!b || b.classList.contains('na')) return;
        sel = p.var.find(x => x.v === +b.dataset.v);
        history.replaceState(null, '', `#/p/${p.id}?v=${sel.v}`);
        update();
      });
      $('#shadeQ')?.addEventListener('input', e => {
        const q = e.target.value.trim().toLowerCase();
        $$('#swatches .sw').forEach(b => { b.hidden = !!q && !b.dataset.k.includes(q); });
      });
    }
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
      $$('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
      ['overview', 'desc', 'details'].forEach(k2 => { const el = $('#tab-' + k2); if (el) el.hidden = b.dataset.tab !== k2; });
    }));
    $('.pd-media').addEventListener('click', e => {
      const th = e.target.closest('.thumb'); if (!th) return;
      const img = $('#mainImg'); img.src = th.dataset.img; img.classList.toggle('boxed', !th.dataset.hero);
      $$('.thumb').forEach(x => x.classList.toggle('on', x === th));
    });
    $$('[data-step]').forEach(b => b.addEventListener('click', () => { const q = $('#qty'); q.value = Math.min(+q.max || 99, Math.max(1, (+q.value || 1) + +b.dataset.step)); }));
    buy.addEventListener('click', () => Cart.add(p.id, Math.max(1, +$('#qty').value || 1), sel ? sel.v : null));
    update();
  }

  function viewAbout() {
    setColors(...(CFG.about.grad || BASE));
    const T = CFG.about;
    main.innerHTML = `
      <section class="stage full"><div class="stage-inner story" style="min-height:calc(100svh - 32px)">
        <div><span class="eyebrow" style="color:var(--ink-2)">${T.eyebrow}</span>
          <div class="sec-head" style="margin:6px 0 20px"><h2 style="font-size:clamp(44px,7vw,110px)">${T.title} <span class="script">${T.script}</span></h2></div>
          ${T.paras.map(x => `<p>${x}</p>`).join('')}</div>
        <div class="big-year" aria-hidden="true">${T.year || CFG.year}</div>
      </div></section>
      ${T.tl ? `<section class="stage plain"><div class="stage-inner" style="padding-top:var(--pad)">
        <div class="sec-head"><div><span class="eyebrow">${T.tlEyebrow || 'Co u nás najdete'}</span><h2>${T.tlTitle || 'Timeline'}</h2></div></div>
        <ol class="timeline">${T.tl.map(([y, x]) => `<li><b>${y}</b><p>${x}</p></li>`).join('')}</ol>
      </div></section>` : ''}
      <section class="stage light"><div class="stage-inner story" style="padding-top:var(--pad)">
        <div><span class="eyebrow">${T.boxEyebrow}</span><div class="sec-head" style="margin:6px 0 18px"><h2>${T.boxTitle}</h2></div><p>${T.boxText}</p></div>
        <p class="quote">${T.quote}</p>
      </div></section>
      ${footer()}`;
  }

  function viewContact() {
    setColors(...(CFG.contact.grad || BASE));
    const C = CFG.contact;
    main.innerHTML = `
      <section class="stage full"><div class="stage-inner">
        <div class="shop-head"><span class="eyebrow" style="color:var(--ink-2)">${t('contact')}</span><h1>${C.title}<span class="script">${C.script}</span></h1></div>
        <div class="contact" style="margin-top:34px">
          <div style="display:grid;gap:16px">
            ${C.boxes.map(b => `<div class="box"><h3>${b.h}</h3>${b.lg ? `<p class="lg">${b.lg}</p>` : ''}${b.p ? `<p style="color:var(--ink-2)">${b.p}</p>` : ''}${b.btn ? `<a class="btn" style="margin-top:10px" href="${b.btn[1]}" target="_blank" rel="noopener">${b.btn[0]} ›</a>` : ''}</div>`).join('')}
            <div class="box"><h3>Ozvěte se</h3>
              <p class="lg"><a href="tel:${SHOP.phoneRaw}">${SHOP.phone}</a></p>
              <p><a class="link" href="mailto:${SHOP.info}">${SHOP.info}</a></p>
              ${SHOP.instagram ? `<p><a class="link" href="${SHOP.instagram}" target="_blank" rel="noopener">Instagram ${esc(SHOP.igHandle || '')}</a></p>` : ''}</div>
          </div>
          <iframe class="map" title="Mapa – ${esc(C.map)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
            src="https://maps.google.com/maps?q=${encodeURIComponent(C.map)}&z=15&output=embed"></iframe>
        </div>
      </div></section>
      <section class="stage plain"><div class="stage-inner contact" style="padding-top:var(--pad)">
        ${C.legal.map(b => `<div class="box"><h3>${b.h}</h3>${b.p.map(x => `<p>${x}</p>`).join('')}</div>`).join('')}
      </div></section>
      ${footer()}`;
  }

  function viewNotFound() {
    setColors('#ff2d95', '#2a0318');
    main.innerHTML = `<section class="stage full"><div class="stage-inner" style="display:grid;place-items:center;min-height:calc(100svh - 32px);text-align:center">
      <div><div class="big-year">404</div><p class="quote" style="margin:20px 0">${t('notFound')}</p><a class="btn" href="#/">${t('home')}</a></div></div></section>`;
  }

  /* ---------- router ---------- */
  function route(keepScroll) {
    if (cleanup) { cleanup(); cleanup = null; }
    toggleMenu(false);
    const [path, qs] = location.hash.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const params = new URLSearchParams(qs || '');
    let r;
    if (!parts.length) r = viewHome();
    else if (parts[0] === 'shop') r = viewShop(parts[1], parts[2]);
    else if (parts[0] === 'p') r = viewProduct(parts[1], params.get('v'));
    else if (parts[0] === 'o-nas') r = viewAbout();
    else if (parts[0] === 'kontakt') r = viewContact();
    else r = viewNotFound();
    if (typeof r === 'function') cleanup = r;
    if (keepScroll !== true) {
      main.classList.remove('page-enter'); void main.offsetWidth; main.classList.add('page-enter');
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
    const h = main.querySelector('h1');
    document.title = (h && parts.length ? h.firstChild.textContent.trim() + ' · ' : '') + CFG.title;
  }

  main.addEventListener('click', e => {
    const a = e.target.closest('[data-add]');
    if (a) { e.preventDefault(); Cart.add(a.dataset.add); }
  });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); toggleMenu(false); } });
  main.addEventListener('submit', e => {
    if (e.target.id !== 'nlForm') return;
    e.preventDefault();
    location.href = `mailto:${SHOP.info}?subject=${encodeURIComponent('Přihláška k odběru novinek')}&body=${encodeURIComponent('Prosím o zasílání novinek na: ' + e.target.EMAIL.value)}`;
  });
  window.addEventListener('hashchange', () => route());
  renderChrome();
  renderBadge();
  route();
})();
