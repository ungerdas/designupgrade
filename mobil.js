// Designupgrade — mobilvisning
// ---------------------------------------------------------------
// Siden har ingen mobilversjon: på telefon tegnes den 980 px bred og forminskes, så
// teksten blir knøttliten. Her får siden telefonens egen bredde (viewport), og
// mobil.css legger alt i én kolonne, med sidemenyen bak en menyknapp øverst.
// Gjelder bare telefoner (smal skjerm og berøring); PC og nettbrett ser ut som før.
// Den skrus av sammen med resten av justeringene («Justeringer på» i popupen).

(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const root = document.documentElement;

  const telefon = Math.min(screen.width, screen.height) <= 600 && matchMedia('(pointer: coarse)').matches;

  // Innstillingen leses asynkront. Siden husker i localStorage om justeringene er
  // skrudd av, så den tegnes riktig med en gang.
  const HINT = 'nbx-mobil';
  const valg = { enabled: true };
  let aktiv = false;
  let meta = null;

  function settInnViewport() {
    if (meta || document.querySelector('meta[name="viewport"]')) return; // siden har sin egen
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    if (document.head) { document.head.prepend(meta); return; }
    // Ved document_start finnes ikke <head> ennå: sett den inn idet den kommer
    root.prepend(meta);
    const vakt = new MutationObserver(() => {
      if (!document.head) return;
      vakt.disconnect();
      if (meta) document.head.prepend(meta);
    });
    vakt.observe(root, { childList: true });
    document.addEventListener('DOMContentLoaded', () => {
      vakt.disconnect();
      if (meta && document.head && meta.parentNode !== document.head) document.head.prepend(meta);
    }, { once: true });
  }

  function bruk(på) {
    if (på === aktiv) return;
    aktiv = på;
    root.classList.toggle('nbx-mobil', på);
    if (på) {
      settInnViewport();
      if (document.readyState !== 'loading') klargjør();
    } else {
      meta?.remove();
      meta = null;
      lukkMeny();
    }
  }

  function oppdater() {
    const av = valg.enabled === false;
    try {
      if (av) localStorage.setItem(HINT, 'av');
      else localStorage.removeItem(HINT);
    } catch {}
    bruk(!av);
  }

  // ---------- Sidemenyen bak en menyknapp ----------
  let knapp = null;
  const åpen = () => root.classList.contains('nbx-meny-apen');
  function lukkMeny() {
    root.classList.remove('nbx-meny-apen');
    knapp?.setAttribute('aria-expanded', 'false');
  }
  function åpneMeny() {
    skuffFarge();
    root.classList.add('nbx-meny-apen');
    knapp?.setAttribute('aria-expanded', 'true');
  }

  const SVG = 'http://www.w3.org/2000/svg';
  function ikon(d) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(SVG, 'path');
    p.setAttribute('d', d);
    svg.append(p);
    return svg;
  }

  function lagMeny() {
    const sidebar = document.getElementById('sidebar');
    const logo = document.getElementById('header_logo');
    if (!sidebar || !logo || knapp) return;
    knapp = document.createElement('button');
    knapp.type = 'button';
    knapp.className = 'nbx-menyknapp';
    knapp.title = 'Meny';
    knapp.setAttribute('aria-label', 'Meny');
    knapp.setAttribute('aria-expanded', 'false');
    knapp.setAttribute('aria-controls', 'sidebar');
    knapp.append(ikon('M4 6.5h16M4 12h16M4 17.5h16'));
    knapp.addEventListener('click', (e) => { e.preventDefault(); if (åpen()) lukkMeny(); else åpneMeny(); });
    logo.prepend(knapp);

    const lukk = document.createElement('button');
    lukk.type = 'button';
    lukk.className = 'nbx-meny-lukk';
    lukk.title = 'Lukk menyen';
    lukk.setAttribute('aria-label', 'Lukk menyen');
    lukk.append(ikon('M6 6l12 12M18 6 6 18'));
    lukk.addEventListener('click', lukkMeny);
    sidebar.prepend(lukk);

    const teppe = document.createElement('div');
    teppe.className = 'nbx-meny-bakgrunn';
    teppe.addEventListener('click', lukkMeny);
    document.body.append(teppe);

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lukkMeny(); });
    // Tilbake-knappen kan vise siden fra hurtigbufferen med menyen fortsatt åpen
    addEventListener('pageshow', lukkMeny);
  }

  // Bakgrunnen bak menyen og fargen på menyknappen hentes fra temaet som er i bruk
  // (vanlig, mørk modus, BrokenStones …), så det passer uansett hvilket tema man har.
  function farge(el) {
    for (let e = el; e; e = e.parentElement) {
      const c = getComputedStyle(e).backgroundColor;
      const m = c.match(/[\d.]+/g);
      if (m && (m.length < 4 || +m[3] > 0.5)) return { css: c, rgb: m.slice(0, 3).map(Number) };
    }
    return { css: '#fff', rgb: [255, 255, 255] };
  }
  const lys = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
  function skuffFarge() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) root.style.setProperty('--nbx-skuff-bg', farge(sidebar.parentElement).css);
  }
  function hodeFarge() {
    const logo = document.getElementById('header_logo');
    if (logo) root.classList.toggle('nbx-hode-lys', lys(farge(logo).rgb));
  }

  // ---------- Ryddig header ----------
  // Hilsenen og tallene står som løpende tekst og brytes tilfeldig. På mobil vises
  // tallene som en rad med små felt (Ratio, Opp, Ned, Aktive, Poeng); navnet og
  // «Logg ut» står allerede øverst i menyen. Av ikonene blir Varsler, Innboks og
  // ikoner med et tall på (f.eks. svar i Supportboks) stående øverst; resten blir
  // punkter i menyen, om de ikke finnes der fra før. Alt dette gjelder bare mobil.
  const BEHOLD = /^\/?(notifications\.php|inbox\.php)$/;
  function ryddHode() {
    const verktøy = document.getElementById('header_toolbar');
    const info = document.getElementById('userinfo');
    if (!verktøy || !info || verktøy.querySelector('.nbx-mstat')) return;

    const rad = document.createElement('div');
    rad.className = 'nbx-mstat';
    const felt = (navn, verdi, href) => {
      if (!verdi) return;
      const f = document.createElement(href ? 'a' : 'div');
      f.className = 'nbx-mstat-felt';
      if (href) f.href = href;
      const n = document.createElement('span');
      n.className = 'nbx-mstat-navn';
      n.textContent = navn;
      const v = document.createElement('span');
      v.className = 'nbx-mstat-verdi';
      v.append(verdi);
      f.append(n, v);
      rad.append(f);
    };
    const kopi = (el) => { if (!el) return null; const k = el.cloneNode(true); k.removeAttribute('id'); return k; };
    const tekst = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
    felt('Ratio', kopi(info.querySelector('#ratio')));
    felt('Opp', tekst(info.querySelector('#uped')));
    felt('Ned', tekst(info.querySelector('#downed')));
    const opp = tekst(info.querySelector('span[title*="seeder"]'));
    const ned = tekst(info.querySelector('span[title*="leecher"]'));
    felt('Aktive', [opp, ned].filter(Boolean).join('  '));
    const poeng = info.querySelector('a[href*="poeng"]');
    felt('Poeng', tekst(poeng), poeng?.getAttribute('href'));
    if (!rad.children.length) return;
    verktøy.prepend(rad);

    // Ikonene: de som ikke beholdes øverst, blir punkter i menyen
    const sidebar = document.getElementById('sidebar');
    const liste = sidebar?.querySelector('ul');
    const finnes = new Set([...(sidebar?.querySelectorAll('a[href]') || [])].map((a) => a.getAttribute('href').replace(/^\//, '')));
    const nye = [];
    for (const a of document.querySelectorAll('#icons a.icon')) {
      const href = a.getAttribute('href') || '';
      const tall = a.querySelector('span:not(.hidden)');
      const harTall = tall && /\d/.test(tall.textContent) && !/^0\b/.test(tall.textContent.trim());
      if (BEHOLD.test(href) || harTall) continue;
      a.classList.add('nbx-ikon-meny');
      if (!finnes.has(href.replace(/^\//, ''))) nye.push([a.title || href, href]);
    }
    if (liste && nye.length) {
      const topp = liste.querySelector(':scope > li.top');
      const tittel = document.createElement('li');
      tittel.className = 'title nbx-bare-mobil';
      tittel.textContent = nye.every(([, h]) => /inbox|support/.test(h)) ? 'Meldinger' : 'Meldinger og lister';
      const punkter = nye.map(([navn, href]) => {
        const li = document.createElement('li');
        li.className = 'item nbx-bare-mobil';
        const a = document.createElement('a');
        a.href = href;
        a.textContent = navn;
        li.append(a);
        return li;
      });
      if (topp) topp.after(tittel, ...punkter);
      else liste.prepend(tittel, ...punkter);
    }
  }

  // ---------- Forumtabellene blir kort ----------
  // Én boks per forum/emne: navnet øverst, tallene under med kolonneoverskriften
  // som etikett («Svar: 9 · Vist: 94»). Etikettene hentes fra overskriftsraden.
  function kortbord() {
    for (const t of document.querySelectorAll('#content table.forumTable:not(.nbx-kortbord)')) {
      t.classList.add('nbx-kortbord');
      let etiketter = [];
      for (const tr of t.rows) {
        const celler = [...tr.cells];
        const th = celler.filter((c) => c.tagName === 'TH');
        if (th.length > 1) { // overskriftsrad: Emne | Forum | Svar | Vist | Forfatter | Siste innlegg
          tr.classList.add('nbx-kb-hode');
          etiketter = [];
          for (const c of celler) {
            etiketter.push(c.textContent.trim());
            for (let i = 1; i < c.colSpan; i++) etiketter.push(''); // ekstra kolonner under samme overskrift
          }
          continue;
        }
        if (th.length) { tr.classList.add('nbx-kb-seksjon'); continue; } // seksjonsrad («Generelt» …)
        if (celler.every((c) => c.classList.contains('forumspacer'))) { tr.classList.add('nbx-kb-tom'); continue; }
        let kol = 0;
        for (const c of celler) {
          const e = etiketter[kol] || '';
          if (kol > 0 && e) c.dataset.nbxEtikett = e;
          if (/^siste/i.test(e)) c.classList.add('nbx-hel');
          kol += c.colSpan;
        }
      }
    }
  }

  // ---------- NFO i beskrivelsen ----------
  // Beskrivelsen er én lang tekst med <br>. Hver linje blir sin egen blokk: vanlig
  // tekst brytes som før, mens ASCII-kunst (flere mellomrom på rad, rammetegn) holdes
  // på én linje og krympes til den passer bredden. Skillelinjer (bare ~~~~ e.l.)
  // kuttes i kanten. <br> blir liggende, så teksten ser ut som før om mobilvisningen
  // slås av mens siden er åpen.
  const RAMME = /[\u2500-\u25ff]/; // rammetegn, blokker og figurer
  const MELLOMROM = /[ \u00a0]{2,}/g; // to eller flere (vanlige eller harde) mellomrom
  const SKILLE = /^[\s _\-=~*#.:+<>|/\\]{8,}$/;
  function linjeType(tekst) {
    const t = tekst.trim();
    if (!t) return '';
    if (RAMME.test(t)) return 'nbx-nfo-kunst';
    if (SKILLE.test(t) && !/\w/.test(t)) return 'nbx-nfo-skille';
    if (tekst.length <= 100 && (tekst.match(MELLOMROM) || []).length >= 2) return 'nbx-nfo-kunst';
    return '';
  }
  function nfoLinjer() {
    for (const span of document.querySelectorAll('#details li.item > span[style*="monospace"]:not([data-nbx-linjer])')) {
      span.dataset.nbxLinjer = '';
      const linjer = [];
      let linje = [];
      for (const n of [...span.childNodes]) {
        linje.push(n);
        if (n.nodeName === 'BR') { linjer.push(linje); linje = []; }
      }
      if (linje.length) linjer.push(linje);
      span.replaceChildren(...linjer.map((noder) => {
        const l = document.createElement('span');
        l.className = 'nbx-nfo-linje';
        l.append(...noder);
        const type = linjeType(l.textContent);
        if (type) l.classList.add(type);
        return l;
      }));
    }
    tilpassKunst();
  }
  // Én felles skriftstørrelse for all kunst i beskrivelsen, så den henger sammen
  function tilpassKunst() {
    for (const span of document.querySelectorAll('span[data-nbx-linjer]')) {
      const kunst = span.querySelectorAll('.nbx-nfo-kunst');
      if (!kunst.length) continue;
      span.style.removeProperty('--nbx-kunst');
      const plass = span.clientWidth;
      let bredest = 0;
      for (const l of kunst) bredest = Math.max(bredest, l.scrollWidth);
      if (!plass || bredest <= plass) continue;
      const str = parseFloat(getComputedStyle(kunst[0]).fontSize);
      span.style.setProperty('--nbx-kunst', Math.max(6, Math.floor((str * plass / bredest) * 10) / 10) + 'px');
    }
  }

  // ---------- Søkeboksen: filtrene bak en knapp ----------
  // Kategorier, kodek, medium osv. tar mer enn en skjermhøyde. Søkefeltet står
  // igjen, og «Filtre» viser resten (tallet er hvor mange som er valgt).
  function filtre() {
    const rad = document.querySelector('#content form div.searchbox.searchstr');
    const form = rad?.closest('form');
    if (!form || form.classList.contains('nbx-filtre')) return;
    const bokser = [...form.querySelectorAll(':scope > div.searchbox:not(.searchstr)')];
    if (!bokser.length) return;
    form.classList.add('nbx-filtre', 'nbx-filtre-lukket');
    const fk = document.createElement('button');
    fk.type = 'button';
    fk.className = 'nbx-filtreknapp';
    fk.setAttribute('aria-expanded', 'false');
    const tell = () => {
      let n = 0;
      for (const b of bokser) {
        n += b.querySelectorAll('input[type="checkbox"]:checked').length;
        for (const i of b.querySelectorAll('input[type="text"]')) if (i.value.trim()) n++;
      }
      fk.textContent = n ? `Filtre (${n})` : 'Filtre';
    };
    fk.addEventListener('click', () => {
      const lukket = form.classList.toggle('nbx-filtre-lukket');
      fk.setAttribute('aria-expanded', String(!lukket));
    });
    form.addEventListener('change', tell);
    tell();
    rad.append(fk);
  }

  // ---------- Loggen blir kort ----------
  // Én boks per hendelse: dato og tid på en liten linje øverst, hendelsen under i
  // full bredde (lange releasenavn brytes). Radtypen (lastet opp, slettet …) beholder
  // fargen sin. Brukerkolonnen (bare for staben) står til høyre på øverste linje.
  function loggliste() {
    for (const tr of document.querySelectorAll('#content table:not(.nbx-loggliste) tr[class^="log_"]')) {
      tr.closest('table').classList.add('nbx-loggliste');
    }
  }

  // ---------- Brede tabeller ----------
  // En tabell med få kolonner som bare er for bred på grunn av lange ord (releasenavn)
  // får bryte ordene. Ellers ruller tabellen sidelengs for seg selv, i stedet for at
  // hele siden blir bredere enn skjermen.
  function rullTabeller() {
    if (!aktiv) return;
    const content = document.getElementById('content');
    if (!content) return;
    kortbord();
    loggliste();
    nfoLinjer();
    filtre();
    for (const t of content.querySelectorAll('table')) {
      const f = t.parentElement;
      if (!f || t.classList.contains('nbx-kortbord') || t.classList.contains('nbx-loggliste') || f.classList.contains('nbx-rull') || f.closest('table')) continue;
      if (t.offsetWidth <= f.clientWidth + 1) continue;
      const kolonner = Math.max(0, ...[...t.rows].slice(0, 5).map((r) => [...r.cells].reduce((n, c) => n + c.colSpan, 0)));
      if (kolonner <= 4) {
        t.classList.add('nbx-bryt');
        if (t.offsetWidth <= f.clientWidth + 1) continue;
        t.classList.remove('nbx-bryt');
      }
      const rull = document.createElement('div');
      rull.className = 'nbx-rull';
      t.before(rull);
      rull.append(t);
    }
  }
  let rullTimer = 0;
  const rullSnart = () => { clearTimeout(rullTimer); rullTimer = setTimeout(rullTabeller, 150); };
  let tilpassTimer = 0;
  function tilpassSnart() { clearTimeout(tilpassTimer); tilpassTimer = setTimeout(() => { if (aktiv) tilpassKunst(); }, 150); }

  let klar = false;
  function klargjør() {
    if (klar) return;
    klar = true;
    lagMeny();
    ryddHode();
    hodeFarge();
    // Raden for tilkoblingsstatus inneholder bare &nbsp; når alt er i orden: skjul den da
    const tilk = document.getElementById('connectable');
    if (tilk && !tilk.textContent.trim() && !tilk.querySelector('img, a')) tilk.classList.add('nbx-tom');
    rullTabeller();
    // Mørk modus av/på bytter tema mens siden er åpen
    new MutationObserver(hodeFarge).observe(root, { attributes: true, attributeFilter: ['class'] });
    const content = document.getElementById('content');
    if (content) new MutationObserver(rullSnart).observe(content, { childList: true, subtree: true });
    addEventListener('load', rullSnart);
    addEventListener('resize', () => { rullSnart(); tilpassSnart(); });
  }
  // ---------- Oppstart ----------
  // Står til slutt, så alt over er klart også om skriptet kjøres etter at siden er lastet
  // PC og nettbrett: ingenting å gjøre (og et merke fra en eldre versjon ryddes bort)
  if (!telefon) {
    try { if (localStorage.getItem(HINT)) localStorage.removeItem(HINT); } catch {}
    return;
  }
  let hint = null;
  try { hint = localStorage.getItem(HINT); } catch {}
  bruk(hint !== 'av');
  api.storage.local.get({ ...valg }).then((v) => { Object.assign(valg, v); oppdater(); }).catch(() => {});
  api.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch.enabled) return;
    valg.enabled = ch.enabled.newValue;
    oppdater();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (aktiv) klargjør(); }, { once: true });
  } else if (aktiv) {
    klargjør();
  }
})();
