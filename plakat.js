// Designupgrade — plakat og handling på torrentsiden (details.php)
// ---------------------------------------------------------------
// 1) På torrentlister husker vi hvilken IMDb-id hver torrent har
//    (detaljsiden viser den ikke).
// 2) På detaljsiden vises en toppdel med plakat, tittel, år, status,
//    rating, sjangre, ID-er og handling fra TMDB (krever TMDB-nøkkel).

(() => {
  'use strict';
  const NBX = (globalThis.NBX = globalThis.NBX || { liste: [] });
  const api = globalThis.browser ?? globalThis.chrome;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // Setter inn ferdig HTML (alle verdier er escapet med esc()) uten innerHTML
  const settHtml = (el, html) => el.replaceChildren(...new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body.childNodes);
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  // ---------- 1) Husk IMDb-id fra torrentlister ----------
  function huskImdb(scope = document) {
    const store = {};
    scope.querySelectorAll('table.torrentTable tr, #torrentTable tr').forEach((tr) => {
      // Bare ekte torrentrader: ikke «reqdetails.php?id=» på ønskesiden (ønske-id ≠ torrent-id),
      // og ikke rader uten nedlastingslenke (der finnes heller ingen IMDb-info å lære av)
      if (!tr.querySelector('a[href*="download.php"]')) return;
      const a = [...tr.querySelectorAll('a[href*="details.php?id="]')].find((x) => !/reqdetails/i.test(x.getAttribute('href')));
      const imdb = (tr.innerHTML.match(/imdb\.com\/title\/(tt\d{7,9})/) || [])[1];
      const tid = a && (a.getAttribute('href').match(/[?&]id=(\d+)/) || [])[1];
      if (tid) store['i:' + tid] = imdb || '-'; // «-» = vet at den ikke har IMDb-id
    });
    if (Object.keys(store).length) api.storage.local.set(store).catch(() => {});
  }

  NBX.liste.push({
    navn: 'Husk IMDb-id fra torrentlister',
    kjør() {
      huskImdb();
      // «Alternativer» og andre lister på detaljsiden lastes med AJAX
      const details = document.getElementById('details');
      if (details) new MutationObserver(() => huskImdb(details)).observe(details, { childList: true, subtree: true });
    },
  });

  // ---------- 2) Toppdel på detaljsiden ----------
  async function finnImdb(tid, name) {
    const key = 'i:' + tid;
    const saved = (await api.storage.local.get(key))[key];
    if (saved) return saved === '-' ? null : saved;
    const onPage = (document.getElementById('content')?.innerHTML.match(/imdb\.com\/title\/(tt\d{7,9})/) || [])[1];
    if (onPage) return onPage;
    if (!name) return null;
    // Ikke sett i en liste ennå: søk etter releasenavnet på siden (ett kall)
    try {
      const html = await fetch('/browse.php?search=' + encodeURIComponent(name), { credentials: 'include' }).then((r) => r.text());
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const row = [...doc.querySelectorAll('#torrentTable tr')].find((tr) => tr.querySelector(`a[href*="details.php?id=${tid}"]`));
      const imdb = row && (row.innerHTML.match(/imdb\.com\/title\/(tt\d{7,9})/) || [])[1];
      if (row) api.storage.local.set({ [key]: imdb || '-' }).catch(() => {});
      return imdb || null;
    } catch {
      return null;
    }
  }

  // Tittel og år fra releasenavnet, brukt til data er hentet (og uten treff)
  function fraNavn(name) {
    const parts = String(name).split(/[.\s_]+/);
    const out = [];
    let year = '';
    let ep = '';
    for (const p of parts) {
      if (/^(19|20)\d{2}$/.test(p) && out.length) { year = p; break; }
      if (/^S\d{1,2}(E\d{1,3})*$/i.test(p)) { ep = p.toUpperCase(); break; }
      if (/^(NORWEGIAN|NORDIC|SWEDISH|DANISH|FINNISH|\d{3,4}p|WEB-?DL|BluRay|HDTV|COMPLETE|REPACK|PROPER)$/i.test(p)) break;
      out.push(p);
    }
    return { title: out.join(' ') || name, year, ep };
  }

  // Etikett → verdi fra «Teknisk/Tracker informasjon»
  function info(details) {
    const out = {};
    details.querySelectorAll('.ulTable ul').forEach((ul) => {
      const [k, v] = ul.children;
      if (k && v) out[txt(k).replace(/:$/, '').toLowerCase()] = txt(v);
    });
    return out;
  }

  const STATUS_CLASS = { 'Pågående': 'nbx-st-on', 'I produksjon': 'nbx-st-on', 'Avsluttet': 'nbx-st-off', 'Avlyst': 'nbx-st-off' };

  function idBadge(kind, label, id, href) {
    return id ? `<a class="nbx-id nbx-id-${kind}" href="${esc(href)}" target="_blank" rel="noopener noreferrer"><i>${label}</i>${esc(id)}</a>` : '';
  }

  function runtime(min) {
    if (!min) return '';
    const h = Math.floor(min / 60);
    return h ? `${h} t ${min % 60} min` : `${min} min`;
  }

  function fyll(hero, f, rel) {
    hero.classList.remove('nbx-loading');
    const title = f.title || rel.title;
    const year = f.year || rel.year;
    settHtml(hero.querySelector('.nbx-hero-title'), `${esc(title)}${year ? ` <span class="nbx-hero-year">(${esc(year)})</span>` : ''}`);

    const poster = hero.querySelector('.nbx-hero-poster');
    if (f.poster) {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.onload = () => { poster.replaceChildren(img); poster.classList.add('nbx-has-img'); };
      img.src = f.poster;
    } else {
      poster.classList.add('nbx-noimg');
    }
    if (f.backdrop || f.poster) {
      const bg = hero.querySelector('.nbx-hero-bg');
      bg.style.backgroundImage = `url("${f.backdrop || f.poster}")`;
      if (!f.backdrop) bg.classList.add('nbx-blur');
    }

    const line = [];
    if (f.status) line.push(`<b class="${STATUS_CLASS[f.status] || ''}">${esc(f.status)}</b>`);
    if (f.kind === 'tv') {
      if (f.seasons) line.push(`${f.seasons} ${f.seasons === 1 ? 'sesong' : 'sesonger'}`);
      if (f.episodes) line.push(`${f.episodes} episoder`);
    } else if (f.runtime) {
      line.push(runtime(f.runtime));
    }
    settHtml(hero.querySelector('.nbx-hero-status'), line.map((x) => `<span>${x}</span>`).join(''));

    const badges = [];
    if (f.vote) badges.push(`<span class="nbx-b nbx-b-vote" title="TMDB-rating">★ ${esc(f.vote.toFixed(1))}</span>`);
    (f.genres || []).forEach((g) => badges.push(`<span class="nbx-b nbx-b-genre">${esc(g)}</span>`));
    if (f.imdb) badges.push(idBadge('imdb', 'IMDb', f.imdb, `https://www.imdb.com/title/${f.imdb}/`));
    if (f.tmdbId) badges.push(idBadge('tmdb', 'TMDB', f.tmdbId, `https://www.themoviedb.org/${f.kind === 'tv' ? 'tv' : 'movie'}/${f.tmdbId}`));
    if (f.tvdbId) badges.push(idBadge('tvdb', 'TVDB', f.tvdbId, `https://thetvdb.com/dereferrer/series/${f.tvdbId}`));
    settHtml(hero.querySelector('.nbx-hero-badges'), badges.join(''));

    const plot = hero.querySelector('.nbx-hero-plot');
    if (f.overview) plot.textContent = f.overview;
    else if (f.source === 'nokey') plot.innerHTML = '<span class="nbx-hint">Legg inn en TMDB-nøkkel i Designupgrade-popupen (verktøylinja) for å få plakat, handling, sjangre og status.</span>';
    else plot.remove();
  }

  NBX.liste.push({
    navn: 'Plakat og handling på torrentsiden',
    sider: ['details'],
    async kjør() {
      const tid = new URLSearchParams(location.search).get('id');
      const details = document.getElementById('details');
      if (!tid || !details || document.querySelector('.nbx-hero')) return;
      const wrap = details.parentElement;
      const h2 = wrap.querySelector(':scope > h2');
      const name = txt(h2);
      const rel = fraNavn(name);
      const inf = info(details);
      const dl = details.querySelector('a[href*="download.php"]');
      const peers = txt([...details.querySelectorAll('li.title')].find((li) => /seedere?/i.test(txt(li))));
      const seed = (peers.match(/(\d+)\s*seedere?/i) || [])[1];
      const leech = (peers.match(/(\d+)\s*leechere?/i) || [])[1];

      const meta = [
        inf['størrelse'] && `<span>${esc(inf['størrelse'])}</span>`,
        seed !== undefined && `<span class="nbx-seed">↑ ${esc(seed)}</span>`,
        leech !== undefined && `<span class="nbx-leech">↓ ${esc(leech)}</span>`,
        inf['lagt til'] && `<span>${esc(inf['lagt til'])}</span>`,
      ].filter(Boolean).join('');

      const hero = document.createElement('section');
      hero.className = 'nbx-hero nbx-loading';
      settHtml(hero, `
        <div class="nbx-hero-bg"></div>
        <div class="nbx-hero-poster"><span>${esc(inf['kategori'] || '')}</span></div>
        <div class="nbx-hero-main">
          <div class="nbx-hero-title">${esc(rel.title)}${rel.year ? ` <span class="nbx-hero-year">(${esc(rel.year)})</span>` : ''}</div>
          <div class="nbx-hero-status"></div>
          <div class="nbx-hero-badges"></div>
          <p class="nbx-hero-plot"></p>
          <div class="nbx-hero-foot">
            <div class="nbx-hero-rel">
              <div class="nbx-hero-name">${esc(name)}</div>
              ${meta ? `<div class="nbx-hero-meta">${meta}</div>` : ''}
            </div>
            ${dl ? `<a class="nbx-hero-dl" href="${esc(dl.getAttribute('href'))}" title="Last ned .torrent">Last ned <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg></a>` : ''}
          </div>
        </div>`);
      wrap.insertBefore(hero, details);
      wrap.classList.add('nbx-hero-wrap');
      // Samme bredde som tabellene under (#details er smalere enn rammen rundt)
      const w = details.getBoundingClientRect().width;
      if (w > 400) hero.style.width = Math.round(w) + 'px';

      const imdb = await finnImdb(tid, name);
      let film = null;
      // IMDb-id først. Tittel og år sendes med for film og TV, så TMDB søkes på tittel
      // når IMDb-id-en mangler (vanlig for norske programmer) eller TMDB ikke kjenner den.
      const kind = /^tv$/i.test(inf['kategori'] || '') || rel.ep ? 'tv' : /^film/i.test(inf['kategori'] || '') ? 'movie' : '';
      const q = {};
      if (imdb) q.imdb = imdb;
      if (kind && rel.title) Object.assign(q, { title: rel.title, year: rel.year, kind });
      if (q.imdb || q.title) {
        try { film = await api.runtime.sendMessage({ type: 'film', ...q }); } catch { film = null; }
      }
      if (!film || film.error) film = { imdb, source: 'none' };
      fyll(hero, film, rel);
    },
  });
})();
