// Designupgrade — plakat og språk i torrentlistene
// ---------------------------------------------------------------
// Tabellen er den samme som før, bortsett fra:
//  • plakaten (fra TMDB) erstatter kategoribildene
//    i «Kategori»-kolonnen; uten plakat står kategoribildene som før
//  • en linje med språk nederst i navnecellen: «LYD» og «UNDERTEKST» med flagg
// Språkene hentes fra MediaInfo (viewmediainfo.php), skånsomt: bare for rader
// som vises, én om gangen med pause, og svaret lagres for godt. Åpner du en
// torrentside, lagres språkene derfra uten ekstra kall.

(() => {
  'use strict';
  const NBX = (globalThis.NBX = globalThis.NBX || { liste: [] });
  const api = globalThis.browser ?? globalThis.chrome;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Setter inn ferdig HTML (alle verdier er escapet med esc()) uten innerHTML
  const settHtml = (el, html) => el.replaceChildren(...new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body.childNodes);
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  // ---------- Språk → flagg ----------
  const nordic = (bg, cross, inner) =>
    `<rect width="20" height="20" fill="${bg}"/><rect x="5" width="6" height="20" fill="${cross}"/><rect y="7" width="20" height="6" fill="${cross}"/>` +
    (inner ? `<rect x="6.5" width="3" height="20" fill="${inner}"/><rect y="8.5" width="20" height="3" fill="${inner}"/>` : '');
  const FLAGS = {
    no: ['Norsk', nordic('#BA0C2F', '#fff', '#00205B')],
    se: ['Svensk', '<rect width="20" height="20" fill="#006AA7"/><rect x="5.5" width="4" height="20" fill="#FECC02"/><rect y="8" width="20" height="4" fill="#FECC02"/>'],
    dk: ['Dansk', '<rect width="20" height="20" fill="#C8102E"/><rect x="5.5" width="3.5" height="20" fill="#fff"/><rect y="8.25" width="20" height="3.5" fill="#fff"/>'],
    fi: ['Finsk', '<rect width="20" height="20" fill="#fff"/><rect x="5.5" width="4" height="20" fill="#002F6C"/><rect y="8" width="20" height="4" fill="#002F6C"/>'],
    is: ['Islandsk', nordic('#02529C', '#fff', '#DC1E35')],
    de: ['Tysk', '<rect width="20" height="7" fill="#000"/><rect y="7" width="20" height="6" fill="#DD0000"/><rect y="13" width="20" height="7" fill="#FFCE00"/>'],
    fr: ['Fransk', '<rect width="7" height="20" fill="#0055A4"/><rect x="7" width="6" height="20" fill="#fff"/><rect x="13" width="7" height="20" fill="#EF4135"/>'],
    nl: ['Nederlandsk', '<rect width="20" height="7" fill="#AE1C28"/><rect y="7" width="20" height="6" fill="#fff"/><rect y="13" width="20" height="7" fill="#21468B"/>'],
    es: ['Spansk', '<rect width="20" height="20" fill="#AA151B"/><rect y="5" width="20" height="10" fill="#F1BF00"/>'],
    it: ['Italiensk', '<rect width="7" height="20" fill="#009246"/><rect x="7" width="6" height="20" fill="#fff"/><rect x="13" width="7" height="20" fill="#CE2B37"/>'],
    pl: ['Polsk', '<rect width="20" height="10" fill="#fff"/><rect y="10" width="20" height="10" fill="#DC143C"/>'],
    ru: ['Russisk', '<rect width="20" height="7" fill="#fff"/><rect y="7" width="20" height="6" fill="#0039A6"/><rect y="13" width="20" height="7" fill="#D52B1E"/>'],
    ja: ['Japansk', '<rect width="20" height="20" fill="#fff"/><circle cx="10" cy="10" r="5" fill="#BC002D"/>'],
    gb: ['Engelsk', '<rect width="20" height="20" fill="#012169"/><path d="M0 0l20 20M20 0 0 20" stroke="#fff" stroke-width="4"/><path d="M0 0l20 20M20 0 0 20" stroke="#C8102E" stroke-width="1.4"/><path d="M10 0v20M0 10h20" stroke="#fff" stroke-width="6"/><path d="M10 0v20M0 10h20" stroke="#C8102E" stroke-width="3.4"/>'],
  };
  const LANGS = [
    [/norw|norsk|bokm|nynorsk/i, 'no'], [/swed|svensk/i, 'se'], [/dan(ish|sk)/i, 'dk'], [/finn|finsk|suomi/i, 'fi'],
    [/icel|islandsk/i, 'is'], [/germ|tysk|deutsch/i, 'de'], [/engl/i, 'gb'], [/fren|fransk/i, 'fr'], [/dutch|neder/i, 'nl'],
    [/span/i, 'es'], [/ital/i, 'it'], [/portug/i, 'pt'], [/japan/i, 'ja'], [/korea/i, 'ko'], [/chin|mandarin|canton/i, 'zh'],
    [/russ/i, 'ru'], [/pol(ish|sk)/i, 'pl'], [/turk/i, 'tr'], [/arab/i, 'ar'], [/hindi/i, 'hi'], [/thai/i, 'th'],
    [/hebr/i, 'he'], [/greek|gresk/i, 'el'], [/czech|tsjekk/i, 'cs'], [/hungar|ungarsk/i, 'hu'], [/ukrain/i, 'uk'],
  ];
  const code = (name) => (LANGS.find(([re]) => re.test(name)) || [])[1] || null;
  function codes(text) {
    const out = [];
    String(text || '').split(/[,/;|]+/).forEach((part) => {
      const c = code(part);
      if (c && !out.includes(c)) out.push(c);
    });
    return out;
  }
  const flag = (c) => (FLAGS[c]
    ? `<svg viewBox="0 0 20 20" role="img" aria-label="${FLAGS[c][0]}"><title>${FLAGS[c][0]}</title>${FLAGS[c][1]}</svg>`
    : `<span class="nbx-flagtxt" title="${esc(c)}">${esc(c.toUpperCase())}</span>`);
  function group(label, list, max) {
    if (!list || !list.length) return '';
    const shown = list.slice(0, max).map(flag).join('');
    const rest = list.length > max ? `<span class="nbx-flagmore" title="${esc(list.slice(max).join(', ').toUpperCase())}">+${list.length - max}</span>` : '';
    return `<span class="nbx-lg"><b>${label}</b>${shown}${rest}</span>`;
  }
  // Lyd: alle språk (nordiske først). Undertekst: bare nordiske (norsk, svensk, dansk, finsk, islandsk).
  const NORDISK = ['no', 'se', 'dk', 'fi', 'is'];
  const nordisk = (l) => NORDISK.filter((c) => (l || []).includes(c));
  const PRI = [...NORDISK, 'gb'];
  const sortert = (l) => [...(l || [])].sort((x, y) => (PRI.indexOf(x) + 1 || 99) - (PRI.indexOf(y) + 1 || 99));
  const langsHtml = (m) => (m && !m.none ? group('Lyd', sortert(m.a), 4) + group('Undertekst', nordisk(m.s), 5) : '');

  // ---------- Torrentsiden: lagre språkene som står der ----------
  NBX.liste.push({
    navn: 'Husk språk fra torrentsiden',
    sider: ['details'],
    kjør() {
      const tid = new URLSearchParams(location.search).get('id');
      const details = document.getElementById('details');
      if (!tid || !details) return;
      const a = [];
      const s = [];
      details.querySelectorAll('.ulTable ul').forEach((ul) => {
        const [k, v] = ul.children;
        const label = txt(k).toLowerCase();
        if (/^lyd/.test(label)) codes(txt(v).replace(/\(.*?\)/g, '')).forEach((c) => a.includes(c) || a.push(c));
        if (/^undertekst/.test(label)) codes(txt(v).replace(/\(.*?\)/g, '')).forEach((c) => s.includes(c) || s.push(c));
      });
      if (a.length || s.length) api.storage.local.set({ ['m:' + tid]: { a, s } }).catch(() => {});
    },
  });

  // ---------- MediaInfo-kø ----------
  const MI_GAP_MS = 1500;
  const MI_SLOW_MS = 8000;
  const mi = { queue: [], queued: new Set(), visible: new Map(), rows: new Map(), busy: false, stopped: false, nextAt: 0, timer: 0, empties: 0 };
  // Rader som er prøvd uten svar, køes ikke på nytt i samme sidevisning
  mi.tried = new Set();

  function parseMediaInfo(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const pre = doc.querySelector('pre');
    if (!pre) return null;
    const lines = pre.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').split('\n');
    const out = { a: [], s: [], tracks: 0 };
    let kind = '';
    for (const raw of lines) {
      const t = raw.replace(/&nbsp;/g, ' ').trim();
      const head = t.match(/^(General|Video|Audio|Text|Menu|Image|Chapters?)(\s*#\s*\d+)?$/i);
      if (head) {
        kind = head[1].toLowerCase();
        if (kind === 'audio' || kind === 'text') out.tracks++;
        continue;
      }
      const m = t.match(/^Language\s*:\s*(.+)$/i);
      if (m && (kind === 'audio' || kind === 'text')) {
        const c = code(m[1]);
        const arr = kind === 'audio' ? out.a : out.s;
        if (c && !arr.includes(c)) arr.push(c);
      }
    }
    return out;
  }

  async function hentMediaInfo(tid) {
    const t0 = Date.now();
    let res;
    try {
      res = await fetch(`/viewmediainfo.php?id=${encodeURIComponent(tid)}`, { credentials: 'include' });
    } catch {
      mi.stopped = true;
      return null;
    }
    if (!res.ok) { mi.stopped = true; return null; }
    const html = new TextDecoder('windows-1252').decode(await res.arrayBuffer());
    if (Date.now() - t0 > MI_SLOW_MS) mi.stopped = true; // treg server: ta pause resten av sidevisningen
    const p = parseMediaInfo(html);
    if (!p) {
      if (++mi.empties >= 3) mi.stopped = true; // utlogget eller endret side
      return null;
    }
    mi.empties = 0;
    const m = p.tracks && (p.a.length || p.s.length) ? { a: p.a, s: p.s } : { none: true };
    api.storage.local.set({ ['m:' + tid]: m }).catch(() => {});
    return m;
  }

  // mi.visible: tid → kortene med den torrenten som vises nå (samme torrent kan stå flere steder)
  const synlig = (tid) => (mi.visible.get(tid)?.size || 0) > 0;

  async function miPump() {
    if (mi.busy || mi.stopped) return;
    const wait = mi.nextAt - Date.now();
    if (wait > 0) {
      if (!mi.timer) mi.timer = setTimeout(() => { mi.timer = 0; miPump(); }, wait);
      return;
    }
    // Rader som er rullet ut av syne hoppes over (de køes igjen når de vises)
    while (mi.queue.length && !synlig(mi.queue[0])) mi.queued.delete(mi.queue.shift());
    const tid = mi.queue.shift();
    if (!tid) return;
    mi.queued.delete(tid);
    mi.tried.add(tid);
    mi.busy = true;
    let m = null;
    try { m = await hentMediaInfo(tid); } finally { mi.busy = false; mi.nextAt = Date.now() + MI_GAP_MS; }
    if (m) {
      for (const row of mi.rows.get(tid) || []) {
        row.done = true;
        settHtml(row.langs, langsHtml(m));
      }
    }
    miPump();
  }

  // ---------- Plakat-kø ----------
  const posters = { waiting: new Map(), active: 0 };
  // q = { imdb?, title?, year?, kind? }: IMDb-id først, ellers (eller i tillegg) tittelsøk hos TMDB
  function wantPoster(q, thumb) {
    const k = q.imdb || ['t', q.kind, q.title, q.year].join('|');
    if (!posters.waiting.has(k)) posters.waiting.set(k, { q, thumbs: [] });
    posters.waiting.get(k).thumbs.push(thumb);
    pumpPosters();
  }
  function pumpPosters() {
    while (posters.active < 3 && posters.waiting.size) {
      const [k, { q, thumbs }] = posters.waiting.entries().next().value;
      posters.waiting.delete(k);
      posters.active++;
      api.runtime.sendMessage({ type: 'film', ...q }).then((f) => {
        const url = f && (f.thumb || f.poster);
        if (!url) return;
        for (const t of thumbs) {
          const img = new Image();
          img.alt = '';
          img.decoding = 'async';
          img.onload = () => { t.replaceChildren(img); t.dataset.stor = f.poster || url; t.parentElement?.classList.add('nbx-has-poster'); };
          img.src = url;
        }
      }).catch(() => {}).finally(() => { posters.active--; pumpPosters(); });
    }
  }

  // ---------- Stor plakat når musa holdes over plakaten ----------
  let storPlakat = null;
  let visTimer = 0;
  function skjulStor() {
    clearTimeout(visTimer);
    storPlakat?.remove();
    storPlakat = null;
  }
  document.addEventListener('mouseover', (e) => {
    const a = e.target.closest?.('a.nbx-kort-plakat[data-stor], a.nbx-thumb[data-stor]');
    if (!a || !document.documentElement.classList.contains('nbx-on')) return;
    clearTimeout(visTimer);
    visTimer = setTimeout(() => {
      skjulStor();
      const r = a.getBoundingClientRect();
      const B = 230, H = 345, luft = 12;
      const el = document.createElement('div');
      el.className = 'nbx-stor-plakat';
      const img = new Image();
      img.alt = '';
      img.src = a.dataset.stor;
      el.append(img);
      const venstre = r.right + luft + B < innerWidth ? r.right + luft : Math.max(8, r.left - luft - B);
      el.style.left = `${venstre}px`;
      el.style.top = `${Math.min(Math.max(8, r.top + r.height / 2 - H / 2), innerHeight - H - 8)}px`;
      document.body.append(el);
      storPlakat = el;
    }, 250);
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest?.('a.nbx-kort-plakat[data-stor], a.nbx-thumb[data-stor]')) skjulStor();
  });
  addEventListener('scroll', skjulStor, { passive: true });

  // Tittel, år og type fra releasenavnet (til tittelsøk når IMDb-id mangler)
  function fraNavn(name) {
    const out = [];
    let year = '';
    let ep = false;
    for (const p of String(name).split(/[.\s_]+/)) {
      if (/^(19|20)\d{2}$/.test(p) && out.length) { year = p; break; }
      if (/^S\d{1,2}(E\d{1,3})*$/i.test(p)) { ep = true; break; }
      if (/^(NORWEGIAN|NORDIC|SWEDISH|DANISH|FINNISH|\d{3,4}p|WEB-?DL|BluRay|HDTV|COMPLETE|REPACK|PROPER)$/i.test(p)) break;
      out.push(p);
    }
    return { title: out.join(' '), year, ep };
  }

  // ---------- Lesing av en tabellrad ----------
  // Tekst der <br> blir mellomrom («2026-11-09<br>16:29:12» → «2026-11-09 16:29:12»)
  function celle(el) {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  const tall = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;

  const KOLONNER = [['kategori', 'cat'], ['navn', 'name'], ['filer', 'files'], ['kom', 'comments'], ['dato', 'date'],
    ['aktiv', 'age'], ['stør', 'size'], ['fullf', 'done'], ['se', 'seed'], ['le', 'leech'], ['opplaster', 'uploader'],
    ['poeng', 'points']];
  function kolonner(table) {
    const head = table.querySelector('tr');
    return [...(head ? head.children : [])].map((th) => {
      const hel = celle(th).toLowerCase();
      // Ønskelista: «Ønsket av», «Oppfylt» og «Oppfylt av»
      if (/^oppfylt av/.test(hel)) return 'filledBy';
      if (/^oppfylt/.test(hel)) return 'filled';
      if (/^ønsket av/.test(hel)) return 'requester';
      const w = hel.split(/[\s(]/)[0].replace(/\.$/, '');
      const hit = KOLONNER.find(([p]) => (p.length <= 2 ? w === p : w.startsWith(p)));
      return hit ? hit[1] : /^st.{1,4}r$/.test(w) ? 'size' : null;
    });
  }

  // Lenken til selve torrenten. «reqdetails.php?id=» på ønskesiden er et ønske, ikke en torrent.
  const torrentLenke = (el) => [...el.querySelectorAll('a[href*="details.php?id="]')].find((a) => !/reqdetails/i.test(a.getAttribute('href')));

  // ---------- Kortvisning (i sidens farger) ----------
  const KAT = { filmer: ['FILM', '#3f8fd8'], tv: ['TV', '#e5484d'], programmer: ['PROGRAM', '#8e6bd8'], spill: ['SPILL', '#3fae6a'],
    musikk: ['MUSIKK', '#e0a100'], tidsskrift: ['BLAD', '#23b0d6'], 'lydbøker': ['LYDBOK', '#c27c3e'], lydbker: ['LYDBOK', '#c27c3e'],
    musikkvideoer: ['M.VIDEO', '#d0569b'], podcasts: ['PODCAST', '#7c8fa6'] };
  const SVG = {
    dl: '<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/>',
    up: '<path d="M12 19V5m0 0-6 6m6-6 6 6"/>',
    down: '<path d="M12 5v14m0 0-6-6m6 6 6-6"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    file: '<path d="M14 3H6v18h12V7zM14 3v4h4"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    disk: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  };
  const ikon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[n]}</svg>`;
  const kortRes = (s) => (String(s).match(/\d{3,4}p/i) || [s])[0];

  function lesRad(tr, keys) {
    const c = {};
    [...tr.children].forEach((td, i) => { if (keys[i]) c[keys[i]] = td; });
    const navnTd = c.name;
    const a = navnTd && torrentLenke(navnTd);
    if (!a) return null;
    const catLinks = c.cat ? [...c.cat.querySelectorAll('a[title]')] : [];
    const imdbA = navnTd.querySelector('a[href*="imdb.com/title/"]');
    const imdbTxt = celle(imdbA);
    const up = c.uploader && c.uploader.querySelector('a[href*="userdetails"]');
    return {
      tid: (a.getAttribute('href').match(/[?&]id=(\d+)/) || [])[1],
      name: a.getAttribute('title') || celle(a),
      href: a.getAttribute('href'),
      cat: catLinks[0] ? catLinks[0].title : '',
      specs: catLinks.slice(1).map((x) => x.title),
      imdb: imdbA ? (imdbA.getAttribute('href').match(/tt\d{7,9}/) || [])[0] : null,
      imdbHref: imdbA ? imdbA.getAttribute('href') : '',
      rating: (imdbTxt.match(/:\s*(\d+(?:[.,]\d)?)/) || [])[1] || '',
      top250: (imdbTxt.match(/#\s*(\d+)/) || [])[1] || '',
      genres: [...navnTd.querySelectorAll('.genres a')].map((g) => ({ name: celle(g), href: g.getAttribute('href') })),
      status: [...navnTd.querySelectorAll('img[title]')].filter((img) => !img.closest('a')).map((img) => img.title).filter((t) => !/^non-?scene$/i.test(t)),
      ny: /\(\s*ny\s*\)/i.test(celle(navnTd)),
      dl: navnTd.querySelector('a[href*="download.php"]'),
      bookmark: navnTd.querySelector('a[href*="bookmark.php"]'),
      comment: navnTd.querySelector('a[href*="comment.php"]'),
      edit: navnTd.querySelector('a[href*="edit.php"]'),
      files: c.files ? { n: tall(celle(c.files)), href: c.files.querySelector('a')?.getAttribute('href') } : null,
      comments: c.comments ? { n: tall(celle(c.comments)), href: c.comments.querySelector('a')?.getAttribute('href') } : null,
      date: celle(c.date),
      age: celle(c.age),
      size: celle(c.size),
      done: c.done ? tall(celle(c.done)) : null,
      seed: c.seed ? { n: tall(celle(c.seed)), href: c.seed.querySelector('a')?.getAttribute('href') } : null,
      leech: c.leech ? { n: tall(celle(c.leech)), href: c.leech.querySelector('a')?.getAttribute('href') } : null,
      uploader: up ? { name: celle(up), href: up.getAttribute('href') } : null,
      owner: tr.classList.contains('owner'),
    };
  }

  function tallboks(cls, ic, n, href, title) {
    if (n === null || n === undefined) return '';
    const tag = href ? 'a' : 'span';
    return `<${tag} class="nbx-tb ${cls}${n === 0 || n === '0' ? ' nbx-null' : ''}"${href ? ` href="${esc(href)}"` : ''} title="${esc(title)}">${ikon(ic)}<b>${esc(n)}</b></${tag}>`;
  }

  function lagKort(d) {
    const k = KAT[d.cat.toLowerCase()] || [d.cat.toUpperCase().slice(0, 7), '#496686'];
    const res = d.specs.map(kortRes).find((x) => /^\d{3,4}p$/i.test(x)) || '';
    const meta = [];
    if (d.ny) meta.push('<span class="nbx-ny">Ny</span>');
    if (d.rating) meta.push(`<a class="nbx-rating" href="${esc(d.imdbHref)}" title="IMDb${d.top250 ? ' · Topp 250 #' + esc(d.top250) : ''}">${ikon('star')}${esc(d.rating)}</a>`);
    meta.push(`<span class="nbx-kat" style="color:${k[1]}">${esc(k[0])}</span>`);
    d.specs.forEach((sp) => meta.push(`<span>${esc(kortRes(sp))}</span>`));
    d.status.forEach((st) => meta.push(`<span class="nbx-status">${esc(st)}</span>`));
    if (d.uploader) meta.push(`<a class="nbx-opplaster" href="${esc(d.uploader.href)}">${ikon('user')}${esc(d.uploader.name)}</a>`);
    if (d.age) meta.push(`<span class="nbx-alder" title="${esc(d.date)}">${esc(d.age)} siden</span>`);

    const kort = document.createElement('article');
    kort.className = 'nbx-kort' + (d.owner ? ' nbx-owner' : '');
    kort.dataset.tid = d.tid;
    settHtml(kort, `
      <a class="nbx-kort-plakat" href="${esc(d.href)}" tabindex="-1" title="${esc([d.cat, ...d.specs].join(' · '))}" style="--kat:${k[1]}"><span><b>${esc(k[0])}</b>${res ? `<i>${esc(res)}</i>` : ''}</span></a>
      <div class="nbx-kort-midt">
        <a class="nbx-kort-navn" href="${esc(d.href)}" title="${esc(d.name)}">${esc(d.name)}</a>
        <div class="nbx-kort-meta">${meta.join('')}</div>
        <div class="nbx-kort-l3"><div class="nbx-langs"></div>${d.genres.length ? `<span class="nbx-sjangre">${d.genres.map((g) => `<a href="${esc(g.href)}">${esc(g.name)}</a>`).join(', ')}</span>` : ''}</div>
      </div>
      <div class="nbx-kort-hoyre">
        <div class="nbx-kort-knapper"></div>
        <div class="nbx-kort-tall">
          ${tallboks('nbx-tb-kom', 'chat', d.comments?.n, d.comments?.href, 'Kommentarer')}
          ${tallboks('nbx-tb-filer', 'file', d.files?.n, d.files?.href, 'Filer')}
          ${tallboks('nbx-tb-fullf', 'check', d.done, null, 'Fullført')}
          ${tallboks('nbx-tb-seed', 'up', d.seed?.n, d.seed?.href, 'Seedere')}
          ${tallboks('nbx-tb-leech', 'down', d.leech?.n, d.leech?.href, 'Leechere')}
          ${d.size ? `<span class="nbx-tb nbx-tb-size" title="Størrelse">${ikon('disk')}<b>${esc(d.size)}</b></span>` : ''}
        </div>
      </div>`);
    // Sidens egne lenker flyttes inn (ikke kopieres), så klikkene deres virker som før
    const knapper = kort.querySelector('.nbx-kort-knapper');
    for (const lenke of [d.edit, d.bookmark, d.comment]) if (lenke) { lenke.classList.add('nbx-ikonknapp'); knapper.append(lenke); }
    if (d.dl) {
      d.dl.className = 'nbx-lastned';
      settHtml(d.dl, `Last ned ${ikon('dl')}`);
      if (!d.dl.title) d.dl.title = 'Last ned';
      knapper.append(d.dl);
    }
    return kort;
  }

  // ---------- Ønskelista (viewrequests.php) ----------
  // «2026-09-01 15:42:53» → «2 mnd siden»
  function siden(dato) {
    const t = Date.parse(String(dato).trim().replace(' ', 'T'));
    if (!t) return '';
    const dager = Math.floor((Date.now() - t) / 864e5);
    if (dager < 1) return 'i dag';
    if (dager < 2) return 'i går';
    if (dager < 31) return `${dager} dager siden`;
    const mnd = Math.floor(dager / 30.44);
    if (mnd < 12) return `${mnd} mnd siden`;
    return `${Math.floor(dager / 365.25)} år siden`;
  }
  // 11 152 980 → «11,2 M», 604 455 → «604 k»
  const kompakt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',').replace(/,0$/, '')} M` : n >= 1e4 ? `${Math.round(n / 1e3)} k` : String(n));

  function lesOnske(tr, keys) {
    const c = {};
    [...tr.children].forEach((td, i) => { if (keys[i]) c[keys[i]] = td; });
    const a = c.name && c.name.querySelector('a[href*="reqdetails.php?id="]');
    if (!a) return null;
    const bruker = (td) => {
      const u = td && td.querySelector('a[href*="userdetails"]');
      return u ? { name: celle(u), href: u.getAttribute('href') } : null;
    };
    const ja = c.filled && torrentLenke(c.filled);
    return {
      name: (a.getAttribute('title') || celle(a)).trim(),
      href: a.getAttribute('href'),
      cat: c.cat?.querySelector('a[title]')?.title || '',
      date: celle(c.date),
      requester: bruker(c.requester),
      filledHref: ja ? ja.getAttribute('href') : null,
      filledBy: bruker(c.filledBy),
      points: c.points ? { n: tall(celle(c.points)), href: c.points.querySelector('a')?.getAttribute('href') } : null,
      comments: c.comments ? { n: tall(celle(c.comments)), href: c.comments.querySelector('a')?.getAttribute('href') } : null,
    };
  }

  function lagOnskeKort(d) {
    const k = KAT[d.cat.toLowerCase()] || [d.cat.toUpperCase().slice(0, 7), '#496686'];
    const meta = [`<span class="nbx-kat" style="color:${k[1]}">${esc(k[0])}</span>`];
    if (d.requester) meta.push(`<a class="nbx-opplaster" href="${esc(d.requester.href)}" title="Ønsket av">${ikon('user')}${esc(d.requester.name)}</a>`);
    const s = siden(d.date);
    if (s) meta.push(`<span class="nbx-alder" title="${esc(d.date)}">${esc(s)}</span>`);
    meta.push(d.filledHref
      ? `<span class="nbx-oppfylt">${ikon('check')}Oppfylt${d.filledBy ? ` av <a href="${esc(d.filledBy.href)}">${esc(d.filledBy.name)}</a>` : ''}</span>`
      : '<span class="nbx-ikke-oppfylt">Ikke oppfylt</span>');

    const kort = document.createElement('article');
    kort.className = 'nbx-kort nbx-onske' + (d.filledHref ? ' nbx-er-oppfylt' : '');
    settHtml(kort, `
      <a class="nbx-kort-plakat" href="${esc(d.href)}" tabindex="-1" title="${esc(d.cat)}" style="--kat:${k[1]}"><span><b>${esc(k[0])}</b></span></a>
      <div class="nbx-kort-midt">
        <a class="nbx-kort-navn" href="${esc(d.href)}" title="${esc(d.name)}">${esc(d.name)}</a>
        <div class="nbx-kort-meta">${meta.join('')}</div>
      </div>
      <div class="nbx-kort-hoyre">
        ${d.filledHref ? `<a class="nbx-lastned nbx-til-torrent" href="${esc(d.filledHref)}">Til torrenten</a>` : ''}
        ${d.points ? tallboks('nbx-tb-poeng', 'star', kompakt(d.points.n), d.points.href, `Poeng: ${d.points.n.toLocaleString('nb-NO')}`) : ''}
        ${tallboks('nbx-tb-kom', 'chat', d.comments?.n, d.comments?.href, 'Kommentarer')}
      </div>`);
    return kort;
  }

  // Sorteringslenkene fra tabelloverskriften, siden kolonnene er borte i kortvisning
  function sorteringslinje(table) {
    const lenker = [...table.querySelectorAll('tr:first-child a[href*="sort="]')];
    if (!lenker.length) return null;
    const linje = document.createElement('div');
    linje.className = 'nbx-sorter';
    linje.innerHTML = '<span>Sorter:</span>';
    for (const l of lenker) {
      const a = document.createElement('a');
      a.href = l.getAttribute('href');
      a.textContent = celle(l).replace(/[()]/g, '');
      if (/[?&]sort=([^&]+)/.test(location.search) && a.href.includes('sort=' + new URLSearchParams(location.search).get('sort') + '&')) a.className = 'nbx-aktiv';
      linje.append(a);
    }
    return linje;
  }

  // ---------- Skjul språk (popupen) ----------
  // Torrenter merket DANiSH, SWEDiSH eller FiNNiSH i navnet kan skjules (NORDiC og
  // andre vises fortsatt). Kort og rader får data-nbx-sprak, og CSS skjuler dem via
  // klassene nbx-skjul-da/-sv/-fi på <html>, så det virker med en gang. Skjulte kort
  // er aldri synlige, så de henter heller ikke plakat eller MediaInfo.
  const SPRAK_MERKE = { da: 'DANISH', sv: 'SWEDISH', fi: 'FINNISH' };
  const SPRAK_NAVN = { da: ['dansk', 'danske'], sv: ['svensk', 'svenske'], fi: ['finsk', 'finske'] };
  // «DANiSH.SUBS» er bare undertekster, og navn som også er merket norsk/nordisk har norsk lyd
  const SPRAK_RE = Object.fromEntries(Object.entries(SPRAK_MERKE).map(([k, ord]) => [k, new RegExp(`(^|[.\\s_-])${ord}(?![.\\s_-]?SUB)(?=[.\\s_-]|$)`, 'i')]));
  const NORSK_RE = /(^|[.\s_-])(NORWEGIAN|NORDIC)(?=[.\s_-]|$)/i;
  function merkSprak(el, navn) {
    if (NORSK_RE.test(navn || '')) return;
    const koder = Object.keys(SPRAK_RE).filter((k) => SPRAK_RE[k].test(navn || ''));
    if (koder.length) el.dataset.nbxSprak = koder.join(' ');
  }
  const skjulLister = []; // { boks: forelderen til kortene/radene, info: «3 danske skjult · Vis» }
  function følgSkjul(boks, foran) {
    const info = document.createElement('div');
    info.className = 'nbx-skjult-info';
    info.hidden = true;
    foran.before(info);
    info.addEventListener('click', (e) => {
      if (!e.target.closest('a')) return;
      e.preventDefault();
      boks.classList.toggle('nbx-vis-skjulte');
      oppdaterSkjulte();
    });
    skjulLister.push({ boks, info });
    oppdaterSkjulte();
  }
  function oppdaterSkjulte() {
    const aktive = (utseende.skjulSprak || []).filter((k) => SPRAK_MERKE[k]);
    for (const { boks, info } of skjulLister) {
      const n = aktive.length ? boks.querySelectorAll(aktive.map((k) => `:scope > [data-nbx-sprak~="${k}"]`).join(', ')).length : 0;
      info.hidden = !n;
      if (!n) { boks.classList.remove('nbx-vis-skjulte'); continue; }
      const vis = boks.classList.contains('nbx-vis-skjulte');
      const ord = aktive.map((k) => SPRAK_NAVN[k][n === 1 ? 0 : 1]).join('/');
      settHtml(info, `${n} ${ord} ${vis ? 'vises' : 'skjult'} · <a href="#">${vis ? 'Skjul igjen' : 'Vis'}</a>`);
    }
  }

  // ---------- Kortfarge og -størrelse ----------
  // Kortfargen følger siden av seg selv: mørke kort med mørk modus og på mørke
  // temaer på siden (BrokenStones, Matrix …), ellers lyse.
  // kortStr (popupen): 'normal', 'kompakt' eller 'mini'. Tas i bruk med en gang, uten omlasting.
  // morktTema: mørk modus for hele siden (justeringer.js setter klassen nbx-tema-mork).
  const UTSEENDE = { kortStr: 'normal', morktTema: false, skjulSprak: [] };
  const utseende = { ...UTSEENDE };
  let bakgrunnMork = false; // bakgrunnen rett bak lista er mørk (sorteringslinja trenger lys tekst)
  let listeForelder = null; // der kortlista står, for å måle bakgrunnen på nytt
  let temaMork = false; // temaet brukeren har valgt, passer best med mørke kort
  // Temaer på siden (Profil → tema) som passer best med koksgrå kort. BrokenStones har
  // nesten svart ramme rundt en kakifarget midte; Matrix er helt svart.
  const MORKE_TEMAER = new Set(['brokenstones', 'matrix']);
  function sidensTema() {
    for (const el of document.querySelectorAll('style, link[rel~="stylesheet"]')) {
      // data-nbx-original: mørk modus har byttet til standardtemaet, dette er brukerens eget
      const m = (el.dataset.nbxOriginal || el.getAttribute('href') || el.textContent || '').match(/themes\/([\w-]+)\/style\.css/i);
      if (m) return m[1].toLowerCase();
    }
    return '';
  }
  function erMork(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || +m[3] > 0.5)) {
        const [r, g, b] = m.map(Number);
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45;
      }
    }
    return false;
  }
  function brukUtseende() {
    const root = document.documentElement;
    const helMork = !!utseende.morktTema;
    root.classList.toggle('nbx-bg-mork', bakgrunnMork || helMork);
    root.classList.toggle('nbx-mork', temaMork || bakgrunnMork || helMork);
    root.classList.toggle('nbx-str-kompakt', utseende.kortStr === 'kompakt');
    root.classList.toggle('nbx-str-mini', utseende.kortStr === 'mini');
    for (const k of Object.keys(SPRAK_MERKE)) root.classList.toggle('nbx-skjul-' + k, (utseende.skjulSprak || []).includes(k));
    oppdaterSkjulte();
  }
  api.storage.local.get(UTSEENDE).then((v) => { Object.assign(utseende, v); brukUtseende(); });
  api.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !Object.keys(UTSEENDE).some((k) => ch[k])) return;
    for (const k of Object.keys(UTSEENDE)) if (ch[k]) utseende[k] = ch[k].newValue ?? UTSEENDE[k];
    brukUtseende();
    // Når hele siden bytter tema, endres bakgrunnen bak lista også. Mål den etter at
    // justeringer.js har satt klassen (neste runde), ellers blir den gamle målt.
    if (ch.morktTema && listeForelder) {
      setTimeout(() => { bakgrunnMork = erMork(listeForelder); brukUtseende(); }, 0);
    }
  });

  // ---------- Tabellene ----------
  async function forbered(table) {
    if (table.dataset.nbx) return;
    table.dataset.nbx = '1';
    table.classList.add('nbx-list');
    const { visning } = await api.storage.local.get({ visning: 'kort' });
    const keys = kolonner(table);
    const kortmodus = visning === 'kort' && keys.includes('name');
    const erOnske = keys.includes('requester') || keys.includes('filled');
    const rows = [];
    let liste = null;
    if (kortmodus) {
      liste = document.createElement('div');
      liste.className = 'nbx-kortliste';
      const sort = sorteringslinje(table);
      if (sort) table.before(sort);
      table.before(liste);
      table.classList.add('nbx-som-kort');
      listeForelder = liste.parentElement;
      bakgrunnMork = erMork(listeForelder);
      temaMork = MORKE_TEMAER.has(sidensTema());
      brukUtseende();
    }
    table.querySelectorAll('tr').forEach((tr) => {
      // Ønsker har ingen torrent ennå, så de får plakat, men ikke språk fra MediaInfo
      const a = erOnske ? tr.querySelector('a[href*="reqdetails.php?id="]') : torrentLenke(tr);
      const id = a && (a.getAttribute('href').match(/[?&]id=(\d+)/) || [])[1];
      if (!id) return;
      const tid = erOnske ? null : id;
      const catLink = tr.querySelector('td a[class^="main_link"]');
      const catTd = catLink && catLink.closest('td');
      if (!catTd) return;
      const cat = catLink.title || '';
      const imdb = (tr.innerHTML.match(/imdb\.com\/title\/(tt\d{7,9})/) || [])[1] || null;
      // IMDb-id først. Tittelen sendes med for film og TV, så TMDB søkes på tittel
      // når IMDb-id-en mangler eller TMDB ikke kjenner den (nye serier/sesonger).
      let navn = a.getAttribute('title') || a.textContent;
      if (erOnske) navn = navn.replace(/[()[\]"]/g, ' '); // «Tittel (2024)» i ønsker
      const n = fraNavn(navn);
      const kind = /^tv$/i.test(cat) || n.ep ? 'tv' : /^film/i.test(cat) ? 'movie' : '';
      const q = {};
      if (imdb) q.imdb = imdb;
      if (kind && n.title.length > 1) Object.assign(q, { title: n.title, year: n.year, kind });

      if (kortmodus) {
        const d = erOnske ? lesOnske(tr, keys) : lesRad(tr, keys);
        if (!d) return;
        const kort = erOnske ? lagOnskeKort(d) : lagKort(d);
        if (!erOnske) merkSprak(kort, navn);
        liste.append(kort);
        rows.push({ el: kort, tid, q, thumb: kort.querySelector('.nbx-kort-plakat'), langs: kort.querySelector('.nbx-langs'), done: erOnske });
        return;
      }

      // Tabellvisning: plakaten erstatter kategoribildene når den er lastet
      tr.classList.add('nbx-row');
      if (!erOnske) merkSprak(tr, navn);
      catTd.classList.add('nbx-catcell');
      const thumb = document.createElement('a');
      thumb.className = 'nbx-thumb';
      thumb.href = a.getAttribute('href');
      thumb.tabIndex = -1;
      thumb.title = [...catTd.querySelectorAll('a[title]')].map((x) => x.title).join(' · ');
      catTd.append(thumb);
      let langs = null;
      if (!erOnske) {
        langs = document.createElement('div');
        langs.className = 'nbx-langs';
        a.closest('td').append(langs);
      }
      rows.push({ el: tr, tid, q, thumb, langs, done: erOnske });
    });
    if (rows.length && !erOnske) følgSkjul(kortmodus ? liste : rows[0].el.parentElement, kortmodus ? liste : table);
    if (rows.length) følgRader(rows);
  }

  // Lagrede språk med en gang, plakat når kortet nærmer seg skjermen og
  // MediaInfo når det faktisk vises. rows: [{ el, tid, q, thumb, langs, done }]
  async function følgRader(rows) {
    // Språk vi allerede kjenner (bare torrenter)
    const medTid = rows.filter((r) => r.tid);
    const known = medTid.length ? await api.storage.local.get(medTid.map((r) => 'm:' + r.tid)) : {};
    for (const r of medTid) {
      const m = known['m:' + r.tid];
      if (m) { r.done = true; settHtml(r.langs, langsHtml(m)); }
      if (!mi.rows.has(r.tid)) mi.rows.set(r.tid, []);
      mi.rows.get(r.tid).push(r);
    }

    // Plakater når raden nærmer seg skjermen, MediaInfo når den faktisk vises
    const byEl = new Map(rows.map((r) => [r.el, r]));
    const near = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        near.unobserve(e.target);
        const r = byEl.get(e.target);
        if (r && (r.q.imdb || r.q.title)) wantPoster(r.q, r.thumb);
      }
    }, { rootMargin: '800px 0px' });
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const r = byEl.get(e.target);
        if (!r) continue;
        if (e.isIntersecting) {
          if (!mi.visible.has(r.tid)) mi.visible.set(r.tid, new Set());
          mi.visible.get(r.tid).add(r.el);
          if (!r.done && !mi.queued.has(r.tid) && !mi.tried.has(r.tid)) { mi.queue.push(r.tid); mi.queued.add(r.tid); }
        } else {
          mi.visible.get(r.tid)?.delete(r.el);
        }
      }
      miPump();
    });
    for (const r of rows) {
      near.observe(r.el);
      if (!r.done) seen.observe(r.el);
    }
  }

  // ---------- Topp 10 / Topp 50 (topten.php) ----------
  // Torrent-tabellene der (toptentype2) har bare plass, navn og tall: ingen kategori,
  // IMDb eller nedlastingslenke. Type og tittel gjettes derfor fra releasenavnet, og
  // film søkes bare når navnet har år og videokilde (så spill og musikk ikke får plakat).
  const VIDEO = /(^|[.\s_-])(\d{3,4}p|Blu-?Ray|WEB-?DL|WEBRip|HDTV|PDTV|BDRip|BRRip|HDRip|DVDRip|DVDR|DVDSCR|DVD[59]|PAL|NTSC|REMUX|UHD|XviD|DivX|x26[45]|H\.?26[45]|HEVC|AVC)(?=[.\s_-]|$)/i;
  const EPISODE = /(^|[.\s_])S\d{1,2}(E\d{1,3})*(?=[.\s_-]|$)/i;
  const SERIE = /(^|[.\s_])((19|20)\d{2}[.\s_-]\d{2}[.\s_-]\d{2}|COMPLETE)(?=[.\s_-]|$)/i; // dato-episoder, hele serier
  // Samlebokser, blader, bøker og musikk får ingen plakat (TMDB ville gjettet feil)
  const IKKE_TMDB = /(^|[.\s_(-])(BOX(SET)?|PACK|COLLECTION|TRILOGY|PENTALOGY|ANTHOLOGY|PDF|EPUB|MOBI|CB[RZ]|MP3|FLAC)(?=[.\s_)-]|$)/i;
  function gjettType(name) {
    const n = fraNavn(name);
    if (IKKE_TMDB.test(name)) return { ...n, kind: '' };
    const video = VIDEO.test(name);
    const kind = EPISODE.test(name) || (video && SERIE.test(name)) ? 'tv' : n.year && video ? 'movie' : '';
    return { ...n, kind };
  }

  function lesTopp(tr, keys) {
    const c = {};
    [...tr.cells].forEach((td, i) => { if (keys[i]) c[keys[i]] = td; });
    const a = c.name && torrentLenke(c.name);
    if (!a) return null;
    const name = (a.getAttribute('title') || celle(a)).trim();
    const t = gjettType(name);
    const tallFra = (td) => (td ? tall(celle(td)) : null);
    return {
      tid: (a.getAttribute('href').match(/[?&]id=(\d+)/) || [])[1],
      name,
      href: a.getAttribute('href'),
      rank: celle(c.rank),
      kind: t.kind,
      res: (name.match(/(?:^|[.\s_-])(\d{3,4}p)(?=[.\s_-]|$)/i) || [])[1] || '',
      q: t.kind && t.title.length > 1 ? { title: t.title, year: t.year, kind: t.kind } : {},
      done: tallFra(c.times_completed),
      data: celle(c.data),
      seed: tallFra(c.seeders),
      leech: tallFra(c.leechers),
      ratio: celle(c.ratio),
    };
  }

  function lagToppKort(d) {
    const k = d.kind === 'tv' ? KAT.tv : d.kind === 'movie' ? KAT.filmer : null;
    const meta = [];
    if (d.rank) meta.push(`<span class="nbx-rang" title="Plass">#${esc(d.rank)}</span>`);
    if (k) meta.push(`<span class="nbx-kat" style="color:${k[1]}">${esc(k[0])}</span>`);
    if (d.res) meta.push(`<span>${esc(d.res)}</span>`);
    if (d.ratio) meta.push(`<span title="Seedere per leecher">Ratio ${esc(d.ratio)}</span>`);

    const kort = document.createElement('article');
    kort.className = 'nbx-kort nbx-topp';
    kort.dataset.tid = d.tid;
    settHtml(kort, `
      <a class="nbx-kort-plakat" href="${esc(d.href)}" tabindex="-1" title="${esc(k ? k[0] : 'Torrent')}" style="--kat:${k ? k[1] : '#496686'}"><span>${k ? `<b>${esc(k[0])}</b>${d.res ? `<i>${esc(d.res)}</i>` : ''}` : `<b class="nbx-rangnr">#${esc(d.rank)}</b>`}</span></a>
      <div class="nbx-kort-midt">
        <a class="nbx-kort-navn" href="${esc(d.href)}" title="${esc(d.name)}">${esc(d.name)}</a>
        <div class="nbx-kort-meta">${meta.join('')}</div>
        <div class="nbx-kort-l3"><div class="nbx-langs"></div></div>
      </div>
      <div class="nbx-kort-hoyre">
        <div class="nbx-kort-tall">
          ${tallboks('nbx-tb-fullf', 'check', d.done, null, 'Nedlastet')}
          ${tallboks('nbx-tb-seed', 'up', d.seed, null, 'Seedere')}
          ${tallboks('nbx-tb-leech', 'down', d.leech, null, 'Leechere')}
          ${d.data ? `<span class="nbx-tb nbx-tb-size" title="Data overført">${ikon('disk')}<b>${esc(d.data)}</b></span>` : ''}
        </div>
      </div>`);
    return kort;
  }

  async function forberedTopp(table) {
    if (table.dataset.nbx) return;
    table.dataset.nbx = '1';
    const { visning } = await api.storage.local.get({ visning: 'kort' });
    if (visning !== 'kort') return; // tabellvisning: sidens egen tabell
    const keys = [...(table.rows[0]?.cells || [])].map((th) => th.className.trim().split(/\s+/)[0] || null);
    if (!keys.includes('name')) return;
    const liste = document.createElement('div');
    liste.className = 'nbx-kortliste nbx-toppliste';
    const rows = [];
    for (const tr of table.rows) {
      const d = lesTopp(tr, keys);
      if (!d || !d.tid) continue;
      const kort = lagToppKort(d);
      merkSprak(kort, d.name);
      liste.append(kort);
      rows.push({ el: kort, tid: d.tid, q: d.q, thumb: kort.querySelector('.nbx-kort-plakat'), langs: kort.querySelector('.nbx-langs'), done: false });
    }
    if (!rows.length) return;
    table.before(liste);
    table.classList.add('nbx-list', 'nbx-som-kort');
    følgSkjul(liste, liste);
    if (!listeForelder) {
      listeForelder = liste.parentElement;
      bakgrunnMork = erMork(listeForelder);
      temaMork = MORKE_TEMAER.has(sidensTema());
      brukUtseende();
    }
    følgRader(rows);
  }

  NBX.liste.push({
    navn: 'Plakat og språk på Topp 10',
    sider: ['topten'],
    kjør() {
      document.querySelectorAll('table.toptentype2').forEach(forberedTopp);
    },
  });

  NBX.liste.push({
    navn: 'Plakat og språk i torrentlistene',
    kjør() {
      // Hovedlister (browse, bokmerker …); ikke «Alternativer» inne på torrentsiden
      document.querySelectorAll('table#torrentTable, table.torrentTable').forEach((t) => {
        if (!t.closest('#details')) forbered(t);
      });
    },
  });
})();
