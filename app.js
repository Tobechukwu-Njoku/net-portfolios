/* ────────────────────────────────────────────────────────────────
   APP — routing, the six gallery layouts, About sidebar,
   contact modal and lightbox. Content comes from content.js, which
   the server builds from its environment settings.
   ──────────────────────────────────────────────────────────────── */

(() => {
  'use strict';

  const C = window.PORTFOLIO;
  const $ = (sel, root = document) => root.querySelector(sel);
  // Text from settings is placed into HTML strings below, so escape it.
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const el = (tag, cls, attrs = {}) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const isServed = location.protocol.startsWith('http');
  const MOBILE = 760;

  /* ═══════════ Seeded randomness (layouts stay stable between visits) ═══════════ */
  function rng(seedStr) {
    let h = 1779033703 ^ seedStr.length;
    for (let i = 0; i < seedStr.length; i++) {
      h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    let a = h >>> 0;
    return () => {                       // mulberry32
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const randInt = (r, min, max) => min + Math.floor(r() * (max - min + 1));

  /* ═══════════ Photos ═══════════ */
  const ratio = p => p.w / p.h;
  const orient = p => (ratio(p) > 1.1 ? 'l' : ratio(p) < 0.9 ? 'p' : 's');

  function srcFor(p, width = 1600) {
    // server.js resizes & converts local images when given ?w=
    if (!p.placeholder && isServed && /^images\//.test(p.src)) return `${p.src}?w=${width}`;
    return p.src;
  }

  let currentPhotos = [];                // order used by the lightbox

  function photo(p, opts = {}) {
    const fig = el('figure', 'ph', { tabindex: '0', role: 'button', 'aria-label': `View ${p.alt || 'photo'}` });
    fig.style.aspectRatio = `${p.w} / ${p.h}`;
    fig.dataset.i = currentPhotos.push(p) - 1;

    const img = el('img', '', { alt: p.alt || '', decoding: 'async' });
    if (!opts.eager) img.loading = 'lazy';
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true });
    img.src = srcFor(p, opts.width);
    fig.append(img);

    if (p.placeholder && C.markPlaceholders) fig.append(Object.assign(el('span', 'ph__tag'), { textContent: 'Placeholder' }));
    if (touchObserver) touchObserver.observe(fig);
    return fig;
  }

  function withCaption(fig, p, wrapCls) {
    const wrap = el('div', wrapCls);
    wrap.append(fig);
    if (p.caption) wrap.append(Object.assign(el('p', 'caption'), { textContent: p.caption }));
    return wrap;
  }

  /* ═══════════ Masonry helper (shortest-column placement) ═══════════ */
  function masonry(photos, weights, opts = {}) {
    const wrap = el('div', 'masonry');
    const cols = weights.map((w, i) => {
      const c = el('div', 'masonry__col');
      c.style.flex = `${w} 1 0`;
      if (opts.offsets) c.style.paddingTop = `${opts.offsets[i]}px`;
      wrap.append(c);
      return { el: c, h: (opts.offsets?.[i] || 0) / 400, w };
    });
    photos.forEach(p => {
      const col = cols.reduce((a, b) => (b.h < a.h ? b : a));
      col.el.append(photo(p, { width: 1200 }));
      col.h += col.w * (1 / ratio(p)) + 0.05;   // height ∝ column weight ÷ aspect ratio
    });
    return wrap;
  }

  /* ═══════════ Layouts ═══════════ */
  const vw = () => window.innerWidth;

  const layouts = {
    /* Asymmetric, chaotic masonry broken up by full-width landscapes */
    featured(photos, cat) {
      const n = vw() >= 1500 ? 4 : vw() >= 1000 ? 3 : vw() >= 480 ? 2 : 1;
      const r = rng(cat.id);
      const weightSets = {
        4: [[1.15, 0.8, 1.3, 0.95], [0.9, 1.35, 0.85, 1.1], [1.3, 0.95, 1.05, 0.8]],
        3: [[1.3, 0.85, 1.1], [0.9, 1.25, 1], [1.1, 0.9, 1.35]],
        2: [[1.2, 0.85], [0.9, 1.15]],
        1: [[1]],
      }[n];

      // Explicit `full: true` flags win; otherwise every 7th landscape becomes a break
      const anyFlag = photos.some(p => p.full);
      let landscapes = 0;
      const isBreak = p => {
        if (orient(p) !== 'l') return false;
        landscapes++;
        return anyFlag ? !!p.full : landscapes % 7 === 0;
      };

      const root = el('div');
      let seg = [], segN = 0;
      const flush = () => {
        if (!seg.length) return;
        const weights = weightSets[segN++ % weightSets.length];
        const offsets = n > 1 ? weights.map(() => randInt(r, 0, 4) * 18) : null;
        root.append(masonry(seg, weights, { offsets }));
        seg = [];
      };
      photos.forEach(p => {
        if (isBreak(p)) {
          flush();
          const b = el('div', 'featured-break');
          b.append(photo(p, { width: 2400 }));
          root.append(b);
        } else seg.push(p);
      });
      flush();
      return root;
    },

    /* Tight, equal masonry, no breaks */
    fauna(photos) {
      const n = vw() >= 1500 ? 5 : vw() >= 1100 ? 4 : vw() >= 700 ? 3 : 2;
      return masonry(photos, Array(n).fill(1));
    },

    /* Sparse random collage: lots of air around each face */
    people(photos, cat) {
      const r = rng(cat.id);
      const grid = el('div', 'collage-people');
      let i = 0, row = 1, side = 0;
      while (i < photos.length) {
        const two = i + 1 < photos.length && r() < 0.55;
        const items = photos.slice(i, i + (two ? 2 : 1));
        i += items.length;

        const spans = items.map(p => ({ l: randInt(r, 5, 6), p: randInt(r, 3, 4), s: 4 }[orient(p)]));
        let starts;
        if (items.length === 2) {
          const free = 12 - spans[0] - spans[1];
          const a = randInt(r, 0, free - 1);
          const gap = 1 + randInt(r, 0, free - 1 - a);
          starts = [1 + a, 1 + a + spans[0] + gap];
        } else {
          starts = [1 + randInt(r, 0, 12 - spans[0])];
        }

        items.forEach((p, k) => {
          const fig = photo(p, { width: 1200, eager: row === 1 });
          fig.style.gridColumn = `${starts[k]} / span ${spans[k]}`;
          fig.style.gridRow = row;
          fig.style.marginTop = `${randInt(r, 0, 10)}vh`;
          // mobile: single column, alternating narrow widths
          const mw = orient(p) === 'l' ? randInt(r, 82, 94) : randInt(r, 58, 76);
          fig.style.setProperty('--m-w', `${mw}%`);
          fig.style.setProperty('--m-ml', side++ % 2 ? `${100 - mw}%` : `${randInt(r, 0, 6)}%`);
          grid.append(fig);
        });
        row++;
      }
      return grid;
    },

    /* Cinematic vertical scroll; runs of vertical photos sit side by side */
    landscape(photos) {
      const root = el('div', 'ls');
      const maxH = 'calc(100vh - var(--header-h) - 10vh)';
      for (let i = 0; i < photos.length; i++) {
        const p = photos[i];
        if (orient(p) === 'p') {
          const run = [p];
          while (i + 1 < photos.length && orient(photos[i + 1]) === 'p' && run.length < 3) run.push(photos[++i]);
          if (run.length > 1) {
            const pair = el('div', 'ls__pair');
            const sum = run.reduce((s, q) => s + ratio(q), 0);
            pair.style.maxWidth = `calc(min(78vh, 900px) * ${sum.toFixed(3)} + ${run.length - 1} * 28px)`;
            run.forEach(q => {
              const f = photo(q, { width: 1400 });
              f.style.flex = `${ratio(q).toFixed(3)} 1 0`;
              pair.append(f);
            });
            root.append(pair);
            continue;
          }
        }
        const slide = el('div', 'ls__slide');
        const f = photo(p, { width: 2400, eager: i === 0 });
        f.style.width = `min(100%, calc(${maxH} * ${ratio(p).toFixed(3)}))`;
        slide.append(f);
        root.append(slide);
      }
      return root;
    },

    /* Chaotic collage of big photos; some subjects are set apart */
    urban(photos, cat) {
      const r = rng(cat.id);
      const mobile = vw() <= MOBILE;
      const grid = el('div', 'collage-urban');
      photos.forEach(p => {
        if (p.isolate) {
          const f = photo(p, { width: 2000 });
          f.style.setProperty('--iso-w', `min(${mobile ? 88 : 62}%, calc(72vh * ${ratio(p).toFixed(3)}))`);
          grid.append(withCaption(f, p, 'urban-isolate'));
          return;
        }
        const o = orient(p);
        const span = mobile
          ? { l: 6, p: pick(r, [3, 4]), s: pick(r, [3, 4]) }[o]
          : { l: pick(r, [6, 7, 8]), p: pick(r, [4, 5]), s: pick(r, [5, 6]) }[o];
        const f = photo(p, { width: 1600 });
        f.style.gridColumn = `span ${span}`;
        if (r() < 0.45) f.style.marginTop = `${randInt(r, 1, 6)}vw`;
        if (!mobile && r() < 0.3) f.style.transform = `translateX(${randInt(r, -2, 2)}vw)`;
        grid.append(f);
      });
      return grid;
    },

    /* Ordered grid of matted frames; featured frames get room to breathe */
    film(photos) {
      const grid = el('div', 'film-grid');
      photos.forEach(p => {
        if (p.feature) {
          const f = photo(p, { width: 2000 });
          f.style.width = `min(100%, 960px, calc(68vh * ${ratio(p).toFixed(3)}))`;
          grid.append(withCaption(f, p, 'film-feature'));
          return;
        }
        const cell = el('div', 'film-cell');
        const f = photo(p, { width: 1200 });
        f.classList.add(ratio(p) >= 4 / 3 ? 'is-wide' : 'is-tall');
        cell.append(f);
        grid.append(cell);
      });
      return grid;
    },
  };

  /* ═══════════ Header, nav, about content ═══════════ */
  document.title = `${C.name} · Photography`;
  $('#brandName').textContent = C.name;
  $('#brandSlogan').textContent = C.slogan || '';
  if (!C.slogan) $('#brandSlogan').remove();
  $('#footerName').textContent = C.name;
  $('#year').textContent = new Date().getFullYear();

  const navHTML = C.categories.map(c => `<li><a class="nav__link" href="#${esc(c.id)}" data-id="${esc(c.id)}">${esc(c.title)}</a></li>`).join('')
    + '<li><a class="nav__link nav__link--about" href="#about" data-about>About / Contact</a></li>';
  $('#navList').innerHTML = navHTML;
  $('#mobileNavList').innerHTML = navHTML;
  $('#brand').href = `#${C.categories[0].id}`;

  $('#aboutPhoto').src = srcFor({ src: C.about.photo }, 400);
  $('#aboutName').textContent = C.name;
  $('#aboutLoc').textContent = C.about.location || '';
  $('#aboutBio').textContent = C.about.bio;

  const ICONS = {
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
    x: '<path d="M4 4l6.8 9.1L4.4 20M20 4l-6.4 6.9M8.2 4H4l11.8 16H20z"/>',
    facebook: '<path d="M14 21v-7.5h2.6l.4-3H14V8.6c0-.9.3-1.6 1.6-1.6H17V4.3a20 20 0 0 0-2.2-.1c-2.2 0-3.8 1.4-3.8 3.9v2.4H8.5v3H11V21"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10.5V17M8 7.2v.1M12 17v-3.6c0-1.6 1-2.6 2.3-2.6s2 .9 2 2.6V17M12 10.5V17"/>',
    behance: '<path d="M3 7h5a2.5 2.5 0 0 1 0 5H3zM3 12h5.5a2.5 2.5 0 0 1 0 5H3zM14.5 13.5h6.5a3.3 3.3 0 1 0-1 2.6M15.5 7.5h4"/>',
    flickr: '<circle cx="7" cy="12" r="3.5"/><circle cx="17" cy="12" r="3.5"/>',
    youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.2v5.6l4.8-2.8z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  };
  $('#socials').innerHTML = (C.socials || []).map(s => {
    const label = s.type === 'x' ? 'X' : s.type[0].toUpperCase() + s.type.slice(1);
    const ext = s.type === 'email' ? '' : ' target="_blank" rel="noopener noreferrer"';
    return `<li><a href="${esc(s.url)}" aria-label="${esc(label)}"${ext}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[s.type] || ICONS.link}</svg></a></li>`;
  }).join('');

  /* ═══════════ Sticky header shrink ═══════════ */
  const header = $('#siteHeader');
  const onScroll = () => {
    const y = window.scrollY;
    if (y > 60) header.classList.add('is-scrolled');
    else if (y < 10) header.classList.remove('is-scrolled');
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ═══════════ Touch: colour the photo nearest centre ═══════════ */
  const touchObserver = matchMedia('(hover: none)').matches && 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => entries.forEach(e => e.target.classList.toggle('is-centered', e.isIntersecting)),
        { rootMargin: '-42% 0px -42% 0px' })
    : null;

  /* ═══════════ Router ═══════════ */
  const page = $('#page');
  let current = null;
  let layoutKey = '';

  const keyFor = cat => {
    const w = vw();
    return `${cat.id}|${cat.layout === 'featured' ? (w >= 1500 ? 4 : w >= 1000 ? 3 : w >= 480 ? 2 : 1)
      : cat.layout === 'fauna' ? (w >= 1500 ? 5 : w >= 1100 ? 4 : w >= 700 ? 3 : 2)
      : w <= MOBILE}`;
  };

  function render(cat) {
    currentPhotos = [];
    if (touchObserver) touchObserver.disconnect();
    const idx = C.categories.indexOf(cat) + 1;

    const intro = el('header', 'intro');
    intro.innerHTML = `<div class="intro__index">${String(idx).padStart(2, '0')} / ${String(C.categories.length).padStart(2, '0')}</div>
      <h1 class="intro__title"></h1><p class="intro__tagline"></p>`;
    $('.intro__title', intro).textContent = cat.title;
    $('.intro__tagline', intro).textContent = cat.tagline ? `“${cat.tagline}”` : '';

    const body = el('section', `gallery layout-${cat.layout}`, { 'aria-label': `${cat.title} gallery` });
    body.append((layouts[cat.layout] || layouts.fauna)(cat.photos, cat));

    page.replaceChildren(intro, body);
    layoutKey = keyFor(cat);
  }

  function setActive(id) {
    document.querySelectorAll('.nav__link[data-id]').forEach(a => {
      const on = a.dataset.id === id;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  function route() {
    const id = location.hash.slice(1);
    if (id === 'about') {                // deep link: open the panel over the first gallery
      history.replaceState(null, '', location.pathname + location.search + (current ? `#${current.id}` : ''));
      if (!current) go(C.categories[0], true);
      openAbout();
      return;
    }
    const cat = C.categories.find(c => c.id === id) || C.categories[0];
    if (cat === current) return;
    go(cat, !current);
  }

  function go(cat, first) {
    setActive(cat.id);
    closeMenu();
    const swap = () => {
      page.classList.remove('is-leaving');
      page.style.animation = 'none'; void page.offsetWidth; page.style.animation = '';
      render(cat);
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (!first) page.focus({ preventScroll: true });
    };
    current = cat;
    if (first) return swap();
    page.classList.add('is-leaving');
    setTimeout(swap, 220);
  }

  window.addEventListener('hashchange', route);

  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (window.innerWidth > MOBILE) closeMenu();
      if (current && keyFor(current) !== layoutKey) {
        const y = window.scrollY;
        render(current);
        window.scrollTo(0, y);
      }
    }, 160);
  });

  /* ═══════════ Mobile menu ═══════════ */
  const burger = $('#burger');
  const menu = $('#mobileMenu');
  function openMenu() {
    menu.hidden = false;
    menu.classList.remove('is-closing');
    burger.setAttribute('aria-expanded', 'true');
    burger.setAttribute('aria-label', 'Close menu');
  }
  function closeMenu() {
    if (menu.hidden || menu.classList.contains('is-closing')) return;
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Open menu');
    menu.classList.add('is-closing');
    setTimeout(() => { menu.hidden = true; menu.classList.remove('is-closing'); }, 280);
  }
  burger.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
  document.addEventListener('click', e => {
    if (!menu.hidden && !e.target.closest('#mobileMenu, #burger')) closeMenu();
  });
  document.querySelectorAll('.nav__link[data-id]').forEach(a => a.addEventListener('click', closeMenu));

  /* ═══════════ Overlay helpers ═══════════ */
  const lockers = new Set();
  const lock = (who, on) => {
    on ? lockers.add(who) : lockers.delete(who);
    document.body.classList.toggle('is-locked', lockers.size > 0);
  };
  function fadeHide(node, ms = 300) {
    node.classList.add('is-closing');
    setTimeout(() => { node.hidden = true; node.classList.remove('is-closing'); }, ms);
  }

  /* ═══════════ About sidebar ═══════════ */
  const about = $('#about');
  const aboutScrim = $('#aboutScrim');
  let aboutReturn = null;

  function openAbout() {
    closeMenu();
    aboutReturn = document.activeElement;
    about.removeAttribute('inert');
    about.setAttribute('aria-hidden', 'false');
    about.classList.add('is-open');
    aboutScrim.hidden = false;
    aboutScrim.classList.remove('is-closing');
    lock('about', true);
    setTimeout(() => $('#aboutClose').focus({ preventScroll: true }), 80);
  }
  function closeAbout() {
    if (!about.classList.contains('is-open')) return;
    about.classList.remove('is-open');
    about.setAttribute('aria-hidden', 'true');
    about.setAttribute('inert', '');
    fadeHide(aboutScrim, 340);
    lock('about', false);
    if (aboutReturn && document.contains(aboutReturn)) aboutReturn.focus({ preventScroll: true });
  }
  document.querySelectorAll('[data-about]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    openAbout();
  }));
  $('#aboutClose').addEventListener('click', closeAbout);
  aboutScrim.addEventListener('click', closeAbout);

  /* ═══════════ Contact modal ═══════════ */
  const overlay = $('#contactOverlay');
  const form = $('#contactForm');
  const done = $('#contactDone');
  const note = $('#formNote');
  let contactReturn = null;

  function openContact() {
    contactReturn = document.activeElement;
    form.hidden = false;
    done.hidden = true;
    note.textContent = '';
    overlay.hidden = false;
    overlay.classList.remove('is-closing');
    lock('contact', true);
    setTimeout(() => $('#cfName').focus({ preventScroll: true }), 120);
  }
  function closeContact() {
    if (overlay.hidden || overlay.classList.contains('is-closing')) return;
    fadeHide(overlay, 300);
    lock('contact', false);
    if (contactReturn && document.contains(contactReturn)) contactReturn.focus({ preventScroll: true });
  }
  $('#contactOpen').addEventListener('click', openContact);
  $('#contactClose').addEventListener('click', closeContact);
  $('#doneClose').addEventListener('click', closeContact);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeContact(); });  // click outside the form

  form.addEventListener('input', e => e.target.closest('.field')?.classList.remove('is-invalid'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const bad = [];
    if (!data.name.trim()) bad.push('name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) bad.push('email');
    if (!data.message.trim()) bad.push('message');
    form.querySelectorAll('.field').forEach(f => f.classList.toggle('is-invalid', bad.includes(f.querySelector('[name]').name)));
    if (bad.length) {
      note.textContent = bad.includes('email') && bad.length === 1 ? 'Please enter a valid email address.' : 'Please fill in every field.';
      return;
    }
    note.textContent = '';

    const btn = $('#sendBtn');
    if (C.contact.endpoint && isServed) {
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const res = await fetch(C.contact.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data),
        });
        const reply = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(reply.error || '');
        showDone('Your message is on its way. I\'ll get back to you soon.');
      } catch (err) {
        note.textContent = (!(err instanceof TypeError) && err.message) || 'Something went wrong. Please try again in a moment.';
      } finally {
        btn.disabled = false; btn.textContent = 'Send';
      }
    } else if (C.contact.email) {
      const subject = encodeURIComponent(`Portfolio enquiry from ${data.name}`);
      const body = encodeURIComponent(`${data.message}\n\n${data.name}\n${data.email}`);
      window.location.href = `mailto:${C.contact.email}?subject=${subject}&body=${body}`;
      showDone('Your email app should open with your message ready to send.');
    } else {
      note.textContent = 'The contact form works when the site runs through node server.js.';
    }
  });
  function showDone(msg) {
    form.reset();
    $('.modal__sub', done).textContent = msg;
    form.hidden = true;
    done.hidden = false;
    $('#doneClose').focus();
  }

  /* ═══════════ Lightbox ═══════════ */
  const lb = $('#lightbox');
  const lbImg = $('#lbImg');
  let lbIndex = 0, lbReturn = null;

  function showLb(i) {
    lbIndex = (i + currentPhotos.length) % currentPhotos.length;
    const p = currentPhotos[lbIndex];
    lbImg.style.animation = 'none'; void lbImg.offsetWidth; lbImg.style.animation = '';
    lbImg.src = srcFor(p, 2400);
    lbImg.alt = p.alt || '';
    $('#lbCount').textContent = `${lbIndex + 1} / ${currentPhotos.length}`;
  }
  function openLb(i) {
    lbReturn = document.activeElement;
    lb.hidden = false;
    lb.classList.remove('is-closing');
    lock('lb', true);
    showLb(i);
    $('#lbClose').focus({ preventScroll: true });
  }
  function closeLb() {
    if (lb.hidden || lb.classList.contains('is-closing')) return;
    fadeHide(lb, 240);
    lock('lb', false);
    if (lbReturn && document.contains(lbReturn)) lbReturn.focus({ preventScroll: true });
  }
  page.addEventListener('click', e => {
    const fig = e.target.closest('.ph');
    if (fig) openLb(+fig.dataset.i);
  });
  page.addEventListener('keydown', e => {
    const fig = e.target.closest('.ph');
    if (fig && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLb(+fig.dataset.i); }
  });
  $('#lbClose').addEventListener('click', closeLb);
  $('#lbPrev').addEventListener('click', () => showLb(lbIndex - 1));
  $('#lbNext').addEventListener('click', () => showLb(lbIndex + 1));
  lb.addEventListener('click', e => { if (e.target === lb) closeLb(); });
  let touchX = null;
  lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) showLb(lbIndex + (dx < 0 ? 1 : -1));
    touchX = null;
  });

  /* ═══════════ Keyboard: Esc closes the topmost layer ═══════════ */
  document.addEventListener('keydown', e => {
    if (!lb.hidden) {
      if (e.key === 'Escape') closeLb();
      else if (e.key === 'ArrowRight') showLb(lbIndex + 1);
      else if (e.key === 'ArrowLeft') showLb(lbIndex - 1);
      return;
    }
    if (e.key !== 'Escape') return;
    if (!overlay.hidden) closeContact();
    else if (about.classList.contains('is-open')) closeAbout();
    else closeMenu();
  });

  /* ═══════════ Pick up photos dropped into the photos folder (<gallery>/) ═══════════
     Layout flags can ride in the file name: "05-tower--isolate.jpg",
     "10-mountains--full.jpg", "03-roll--feature.jpg". */
  async function scanFolders() {
    if (!C.autoScanFolders || !isServed) return;
    const IMG = /\.(jpe?g|png|webp|avif|gif)$/i;
    const FLAGS = ['full', 'isolate', 'feature'];
    const size = src => new Promise(res => {
      const im = new Image();
      im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => res(null);
      im.src = srcFor({ src }, 400);
    });

    await Promise.all(C.categories.map(async cat => {
      try {
        const r = await fetch(`images/${cat.id}/`, { cache: 'no-store' });
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return;
        const files = (await r.json())
          .filter(f => f.type === 'file' && IMG.test(f.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        if (!files.length) return;

        const found = (await Promise.all(files.map(async f => {
          const src = `images/${cat.id}/${encodeURIComponent(f.name)}`;
          if (cat.photos.some(p => p.src === src)) return null;
          const dim = await size(src);
          const base = f.name.replace(/\.[^.]+$/, '');
          const flags = Object.fromEntries(FLAGS.filter(k => new RegExp(`--${k}(?![a-z])`, 'i').test(base)).map(k => [k, true]));
          const alt = base.replace(/--[a-z]+/gi, '').replace(/[-_]+/g, ' ').trim();
          return dim && { src, ...dim, ...flags, alt };
        }))).filter(Boolean);
        if (!found.length) return;

        cat.photos = cat.photos.filter(p => !p.placeholder).concat(found);
        if (cat === current) render(cat);
      } catch { /* folder missing or not listable: keep content.js photos */ }
    }));
  }

  route();
  scanFolders();
})();
