// Designupgrade — mobilvisning
// ---------------------------------------------------------------
// Siden har ingen mobilversjon: på telefon tegnes den 980 px bred og forminskes, så
// teksten blir knøttliten. Her får siden telefonens egen bredde (viewport), og
// mobil.css legger alt i én kolonne, med sidemenyen bak en menyknapp øverst.
// «Auto» gjelder bare telefoner (smal skjerm og berøring); PC og nettbrett ser ut
// som før. «Alltid» slår den på overalt (f.eks. for å teste i et smalt vindu på PC).

(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const root = document.documentElement;

  const telefon = Math.min(screen.width, screen.height) <= 600 && matchMedia('(pointer: coarse)').matches;

  // Innstillingen leses asynkront. Siden husker siste valg i localStorage, så den
  // tegnes riktig med en gang: «av» (eller hele utvidelsen av) og «alltid».
  const HINT = 'nbx-mobil';
  const valg = { enabled: true, mobil: 'auto' };
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
    const av = valg.enabled === false || valg.mobil === 'av';
    const alltid = !av && valg.mobil === 'alltid';
    try {
      if (av || alltid) localStorage.setItem(HINT, av ? 'av' : 'alltid');
      else localStorage.removeItem(HINT);
    } catch {}
    bruk(alltid || (telefon && !av));
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

  // ---------- Brede tabeller ruller sidelengs for seg selv ----------
  // (i stedet for at hele siden blir bredere enn skjermen)
  function rullTabeller() {
    if (!aktiv) return;
    const content = document.getElementById('content');
    if (!content) return;
    kortbord();
    nfoLinjer();
    filtre();
    for (const t of content.querySelectorAll('table')) {
      const f = t.parentElement;
      if (!f || t.classList.contains('nbx-kortbord') || f.classList.contains('nbx-rull') || f.closest('table')) continue;
      if (t.offsetWidth <= f.clientWidth + 1) continue;
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
    hodeFarge();
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
  let hint = null;
  try { hint = localStorage.getItem(HINT); } catch {}
  bruk(hint === 'alltid' || (telefon && hint !== 'av'));
  api.storage.local.get({ ...valg }).then((v) => { Object.assign(valg, v); oppdater(); }).catch(() => {});
  api.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !(ch.enabled || ch.mobil)) return;
    if (ch.enabled) valg.enabled = ch.enabled.newValue;
    if (ch.mobil) valg.mobil = ch.mobil.newValue;
    oppdater();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (aktiv) klargjør(); }, { once: true });
  } else if (aktiv) {
    klargjør();
  }
})();
