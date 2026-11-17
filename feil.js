// Designupgrade — penere feilside
// ---------------------------------------------------------------
// Svarer serveren med en ren feilside (500, 502, 503, 504 …), enten fra webserveren (nginx)
// eller fra sidens egen kode (Symfony sin «Oops! An Error Occurred»), byttes den ut med en
// egen side: stort feilnummer, en forklaring og knapper. På sider som bare viser noe
// (forsiden, torrentlista, torrentsider, forumet …) prøver den igjen av seg selv, med lengre
// pause for hver gang, og laster siden når serveren svarer igjen. Ellers var det gjerne en
// knapp eller lenke som feilet, og da er hovedknappen «Gå tilbake». Symfony-feil skyldes
// sidens kode og prøves aldri av seg selv.

(() => {
  'use strict';
  const NBX = (globalThis.NBX = globalThis.NBX || { liste: [] });

  // [overskrift, hva som skjedde, tillegg]
  const TEKST = {
    500: ['Serveren fikk hikke', 'Noe gikk galt på serveren.', 'Det er ikke noe feil hos deg.'],
    502: ['Serveren svarer ikke', 'Webserveren fikk ikke kontakt med siden bak seg.', 'Den er som regel tilbake om litt.'],
    503: ['Siden tar en pause', 'Den er overbelastet eller under vedlikehold.', ''],
    504: ['Serveren brukte for lang tid', 'Svaret kom ikke tidsnok.', 'Det går ofte bra på neste forsøk.'],
    429: ['Litt for mange forespørsler', 'Serveren ber oss vente litt før vi prøver igjen.', ''],
    404: ['Fant ikke siden', 'Adressen finnes ikke, eller siden er flyttet.', ''],
    403: ['Ingen adgang', 'Du har ikke tilgang til denne siden.', ''],
  };
  // Tillegget når det trolig var en knapp eller lenke som feilet
  const SJEKK = 'Det du gjorde gikk kanskje ikke gjennom, så gå tilbake og sjekk.';
  const PAUSER = [10, 20, 30, 60]; // sekunder mellom forsøkene, deretter hvert minutt
  const MAKS_MINUTTER = 15;
  // Sider som bare viser noe, og som derfor trygt kan lastes på nytt av seg selv
  const LESESIDER = /^\/(?:(?:index|browse|details|forums|userdetails|log|topten|top10|viewrequests|rules|faq|mytorrents)\.php)?$/i;

  function feilside() {
    if (!document.body) return null;
    const tekst = document.body.textContent.replace(/\s+/g, ' ').trim();
    const h1 = document.querySelector('body h1')?.textContent.trim() || '';
    // Webserveren: tittel som «500 Internal Server Error», nesten ingen tekst og en overskrift med samme nummer
    const m = document.title.match(/^\s*(\d{3})\s+(.+?)\s*$/);
    if (m && +m[1] >= 400 && h1.startsWith(m[1]) && tekst.length <= 300) {
      const server = [...document.querySelectorAll('body center')].pop()?.textContent.trim() || '';
      return { kode: +m[1], navn: m[2], server: server && !server.startsWith(m[1]) ? server : '', app: false };
    }
    // Sidens egen kode (Symfony): «Oops! An Error Occurred» og «The server returned a "500 Internal Server Error".»
    const a = /^Oops! An Error Occurred/i.test(h1) && tekst.length <= 1000 && tekst.match(/The server returned an? "(\d{3}) ([^"]+)"/i);
    if (a && +a[1] >= 400) return { kode: +a[1], navn: a[2], server: '', app: true };
    return null;
  }

  // 4xx (unntatt 429) går ikke over av seg selv, så der er det mer nyttig å gå tilbake enn å prøve igjen
  const varig = (kode) => kode >= 400 && kode < 500 && kode !== 429;

  const kanPrøveSelv = (f) => {
    if (f.app || (f.kode < 500 && f.kode !== 429)) return false;
    const action = new URLSearchParams(location.search).get('action') || '';
    return LESESIDER.test(location.pathname) && (!action || /^view/i.test(action));
  };

  // Hovedknappen: prøve igjen av seg selv (sider som bare viser noe), gå tilbake (der en knapp
  // eller lenke feilet), laste på nytt (ny fane uten noe å gå tilbake til) eller ingen (4xx uten historikk)
  const knappvalg = (f) => {
    if (kanPrøveSelv(f)) return 'selv';
    if (history.length > 1) return 'tilbake';
    return varig(f.kode) ? 'ingen' : 'igjen';
  };
  const KNAPP = { selv: 'Prøv igjen nå', tilbake: 'Gå tilbake', igjen: 'Prøv igjen' };

  const CSS = `
html.nbx-on body.nbx-feilside { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
  background: radial-gradient(1200px 600px at 50% 0%, #1b2233 0%, #0b0d12 60%) fixed; color: #d8dce8;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; }
html.nbx-on:not(.nbx-tema-mork) body.nbx-feilside { background: radial-gradient(1200px 600px at 50% 0%, #ffffff 0%, #e9eef4 70%) fixed; color: #22303e; }
.nbx-feil { width: min(520px, 100%); text-align: center; }
/* Logoen fra mørk modus (variabelen --nbx-logo i tema-mork.css); på lys bakgrunn på sidens blåfarge */
.nbx-feil-logo { display: block; width: min(320px, 72vw); aspect-ratio: 440 / 97; margin: 0 auto 30px;
  background: var(--nbx-logo) center / contain no-repeat; }
html.nbx-on:not(.nbx-tema-mork) .nbx-feil-logo { padding: 12px 20px; border-radius: 12px; background-color: #496686;
  background-origin: content-box; box-shadow: 0 6px 20px rgba(30, 58, 86, .25); }
.nbx-feil-kode { position: relative; isolation: isolate; display: inline-block; margin: 0 0 10px; font-size: clamp(88px, 22vw, 150px);
  line-height: 1; font-weight: 800; letter-spacing: -0.04em; color: #fff; user-select: none; animation: nbx-glitch-hoved 3.2s infinite; }
html.nbx-on:not(.nbx-tema-mork) .nbx-feil-kode { color: #1e3a56; }
/* Fargede kopier bak tallet: litt forskjøvet i ro, revet i biter et øyeblikk av og til */
.nbx-feil-kode::before, .nbx-feil-kode::after { content: attr(data-kode); position: absolute; inset: 0; z-index: -1; }
.nbx-feil-kode::before { color: #ff3b6b; transform: translate(-3px, 1px); animation: nbx-glitch-a 3.2s infinite; }
.nbx-feil-kode::after { color: #2ee6ff; transform: translate(3px, -1px); animation: nbx-glitch-b 3.2s infinite; }
html.nbx-on:not(.nbx-tema-mork) .nbx-feil-kode::before { color: #e0245e; }
html.nbx-on:not(.nbx-tema-mork) .nbx-feil-kode::after { color: #0bb5d6; }
@keyframes nbx-glitch-hoved { 0%, 88%, 100% { transform: none; } 89% { transform: translate(2px, 0) skewX(-4deg); } 91% { transform: translate(-2px, 0); } 93% { transform: translate(1px, 0) skewX(3deg); } 95% { transform: none; } }
@keyframes nbx-glitch-a { 0%, 88%, 100% { transform: translate(-3px, 1px); clip-path: inset(0); }
  89% { transform: translate(-12px, 0); clip-path: inset(8% 0 64% 0); } 91% { transform: translate(9px, 0); clip-path: inset(46% 0 32% 0); }
  93% { transform: translate(-7px, 0); clip-path: inset(74% 0 4% 0); } 95% { transform: translate(-3px, 1px); clip-path: inset(0); } }
@keyframes nbx-glitch-b { 0%, 88%, 100% { transform: translate(3px, -1px); clip-path: inset(0); }
  90% { transform: translate(11px, 0); clip-path: inset(58% 0 16% 0); } 92% { transform: translate(-8px, 0); clip-path: inset(20% 0 52% 0); }
  94% { transform: translate(6px, 0); clip-path: inset(4% 0 80% 0); } 96% { transform: translate(3px, -1px); clip-path: inset(0); } }
@media (prefers-reduced-motion: reduce) { .nbx-feil-kode, .nbx-feil-kode::before, .nbx-feil-kode::after { animation: none; } }
.nbx-feil-tittel { margin: 0 0 8px; font-size: 24px; font-weight: 700; line-height: 1.3; color: inherit; }
.nbx-feil-tekst { margin: 0 auto 22px; max-width: 420px; font-size: 15px; line-height: 1.5; opacity: .82; }
.nbx-feil-status:empty { display: none; }
.nbx-feil-status { display: inline-flex; align-items: center; gap: 10px; min-height: 30px; margin: 0 0 22px; font-size: 14px; opacity: .9; }
.nbx-feil-ring { width: 26px; height: 26px; transform: rotate(-90deg); flex: none; }
.nbx-feil-ring circle { fill: none; stroke-width: 3; }
.nbx-feil-ring .spor { stroke: rgba(128, 140, 170, .25); }
.nbx-feil-ring .fremdrift { stroke: #2ee6ff; stroke-linecap: round; transition: stroke-dashoffset 1s linear; }
html.nbx-on:not(.nbx-tema-mork) .nbx-feil-ring .fremdrift { stroke: #3d7cc9; }
.nbx-feil-status.nbx-ok .fremdrift { stroke: #4cd964; }
.nbx-feil-knapper { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 0 0 28px; }
.nbx-feil-knapper button, .nbx-feil-knapper a { font: inherit; font-size: 14px; font-weight: 600; padding: 9px 18px; border-radius: 8px; cursor: pointer; text-decoration: none; }
.nbx-feil-knapper button { border: 0; background: #fff; color: #11151c; }
.nbx-feil-knapper a { border: 1px solid rgba(160, 172, 200, .35); color: inherit; background: transparent; }
html.nbx-on:not(.nbx-tema-mork) .nbx-feil-knapper button { background: #1e3a56; color: #fff; }
.nbx-feil-knapper button:hover { filter: brightness(.92); }
.nbx-feil-knapper a:hover { border-color: rgba(160, 172, 200, .7); }
.nbx-feil-fot { font-size: 12px; opacity: .5; }
`;

  function lag({ kode, navn, server }, valg) {
    const [tittel, hva, tillegg] = TEKST[kode] || (kode >= 500 ? TEKST[500] : ['Noe gikk galt', 'Siden kunne ikke vises.', '']);
    const forklaring = `${hva} ${valg === 'tilbake' && kode >= 500 ? SJEKK : tillegg}`.trim();
    // Feilsidens egen CSS (Symfony har litt) skal ikke blande seg inn
    document.querySelectorAll('head style, head link[rel~="stylesheet"]').forEach((e) => e.remove());
    const stil = document.createElement('style');
    stil.textContent = CSS;
    (document.head || document.documentElement).append(stil);
    document.title = `${kode} · ${tittel}`;
    document.body.replaceChildren();
    document.body.className = 'nbx-feilside';
    const ny = (tag, klasse, tekst) => {
      const el = document.createElement(tag);
      if (klasse) el.className = klasse;
      if (tekst) el.textContent = tekst;
      return el;
    };
    const boks = ny('main', 'nbx-feil');
    boks.lang = 'nb';
    const logo = ny('a', 'nbx-feil-logo');
    logo.href = '/';
    logo.setAttribute('aria-label', 'Til forsiden');
    const tall = ny('div', 'nbx-feil-kode', String(kode));
    tall.dataset.kode = String(kode);
    tall.setAttribute('aria-hidden', 'true');
    const status = ny('div', 'nbx-feil-status');
    status.setAttribute('role', 'status');
    const knapper = ny('div', 'nbx-feil-knapper');
    const igjen = KNAPP[valg] ? ny('button', '', KNAPP[valg]) : null;
    if (igjen) {
      igjen.type = 'button';
      knapper.append(igjen);
    }
    const hjem = ny('a', '', 'Til forsiden');
    hjem.href = '/';
    knapper.append(hjem);
    const kl = new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    // Adressen (uten ?…) står med der noe feilet etter et klikk, så det er lett å si fra om hvor
    const sti = valg !== 'selv' && location.pathname !== '/' ? location.pathname : '';
    const fot = ny('div', 'nbx-feil-fot', [`${kode} ${navn}`, server, sti, `kl. ${kl}`].filter(Boolean).join(' · '));
    const overskrift = ny('div', 'nbx-feil-tittel', tittel);
    overskrift.setAttribute('role', 'heading');
    overskrift.setAttribute('aria-level', '1');
    boks.append(logo, tall, overskrift, ny('p', 'nbx-feil-tekst', forklaring), status, knapper, fot);
    document.body.append(boks);
    return { status, igjen };
  }

  // Nedtelling med en ring som tømmes, og en sjekk mot samme adresse når den er ute.
  function prøvIgjen({ status, igjen }, kode) {
    const start = Date.now();
    let forsøk = 0;
    let tid = 0;
    const R = 10;
    const OMKRETS = 2 * Math.PI * R;
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ring.setAttribute('viewBox', '0 0 26 26');
    ring.setAttribute('class', 'nbx-feil-ring');
    for (const k of ['spor', 'fremdrift']) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', k);
      c.setAttribute('cx', '13');
      c.setAttribute('cy', '13');
      c.setAttribute('r', String(R));
      ring.append(c);
    }
    const fremdrift = ring.querySelector('.fremdrift');
    fremdrift.style.strokeDasharray = String(OMKRETS);
    const tekst = document.createElement('span');
    status.append(ring, tekst);
    const vis = (t, del = 1) => { tekst.textContent = t; fremdrift.style.strokeDashoffset = String(OMKRETS * (1 - del)); };

    const last = () => {
      vis('Den er tilbake! Laster siden …', 1);
      status.classList.add('nbx-ok');
      if (location.hash) location.reload();
      else location.replace(location.href);
    };
    const sjekk = async () => {
      clearTimeout(tid);
      forsøk++;
      vis('Sjekker om serveren svarer …', 1);
      try {
        const r = await fetch(location.href, { credentials: 'include', cache: 'no-store' });
        if (r.ok) return last();
      } catch { /* fortsatt nede */ }
      planlegg();
    };
    const planlegg = () => {
      if (Date.now() - start > MAKS_MINUTTER * 60e3) return vis('Siden er fortsatt nede. Prøv igjen senere.', 0);
      const sek = PAUSER[Math.min(forsøk, PAUSER.length - 1)] * (kode === 429 ? 3 : 1);
      const slutt = Date.now() + sek * 1000;
      const tikk = () => {
        const igjenS = Math.max(0, Math.ceil((slutt - Date.now()) / 1000));
        vis(`Prøver igjen om ${igjenS} s${forsøk ? ` · forsøk ${forsøk + 1}` : ''}`, igjenS / sek);
        if (igjenS <= 0) sjekk();
        else tid = setTimeout(tikk, 1000);
      };
      tikk();
    };
    igjen.addEventListener('click', sjekk);
    planlegg();
  }

  NBX.liste.push({
    navn: 'Penere feilside',
    kjør() {
      const f = feilside();
      if (!f) return;
      const valg = knappvalg(f);
      const deler = lag(f, valg);
      if (valg === 'selv') prøvIgjen(deler, f.kode);
      else if (valg === 'tilbake') deler.igjen.addEventListener('click', () => history.back());
      else if (valg === 'igjen') deler.igjen.addEventListener('click', () => location.reload());
    },
  });
})();
