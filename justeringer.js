// Designupgrade — dine JavaScript-justeringer
// ---------------------------------------------------------------
// Kjøres bare på siden manifest.json peker på. Siden er urørt til du legger noe inn i
// JUSTERINGER nederst. Virker i både Firefox og Chrome.

(() => {
  'use strict';
  const api = globalThis.browser ?? globalThis.chrome;
  const root = document.documentElement;

  // Hvilken side du er på: «browse», «details», «index» osv.
  const side = location.pathname.replace(/^\/+/, '').replace(/\.php$/, '') || 'index';
  root.dataset.nbxSide = side;

  // Felles for alle filene i utvidelsen. Andre filer (f.eks. plakat.js)
  // legger sine justeringer i NBX.liste, så kjøres de sammen med dine.
  const NBX = (globalThis.NBX = globalThis.NBX || { liste: [] });
  NBX.api = api;
  NBX.side = side;

  // Av/på fra popupen. CSS-justeringer følger klassen nbx-on med en gang;
  // JS-justeringer kjøres bare når siden lastes med Designupgrade på.
  const setOn = (on) => root.classList.toggle('nbx-on', on !== false);
  setOn(true);

  // Mørk modus for hele siden (tema-mork.css følger klassen nbx-tema-mork, og
  // «Enda mørkere» legger til nbx-tema-morkere). Innstillingen leses asynkront, så
  // et lite hint i sidens localStorage gjør at klassene er på plass før siden
  // tegnes første gang (ellers blinker den lyst).
  const TEMA_HINT = 'nbx-tema';
  const setTema = (mork, morkere) => {
    root.classList.toggle('nbx-tema-mork', !!mork);
    root.classList.toggle('nbx-tema-morkere', !!(mork && morkere));
    try {
      if (mork) localStorage.setItem(TEMA_HINT, morkere ? 'morkere' : 'mork');
      else localStorage.removeItem(TEMA_HINT);
    } catch {}
    oppdaterStiler();
  };
  // morkModus: 'av', 'mork' eller 'morkere' (morktTema er med for eldre innstillinger)
  const erMorkere = (v) => !!v.morktTema && v.morkModus === 'morkere';
  const temaVerdi = { morktTema: false, morkModus: '' };

  // Mørk modus bygger på sidens standardtema. Har man valgt et annet tema
  // (BrokenStones, Matrix …), slår fargene og bildene i det gjennom, så så lenge
  // mørk modus er på, importeres standardtemaet i stedet. Originalen tas vare på
  // i data-nbx-original og settes tilbake når mørk modus slås av.
  const TEMA_RE = /(themes\/)([\w-]+)(\/style\.css)/i;
  const morkAktiv = () => root.classList.contains('nbx-tema-mork') && root.classList.contains('nbx-on');
  function standardtema(el, på) {
    if (!(el instanceof HTMLStyleElement)) return;
    const orig = el.dataset.nbxOriginal ?? el.textContent;
    const m = orig.match(TEMA_RE);
    if (!m || m[2].toLowerCase() === 'default') return;
    if (på) {
      el.dataset.nbxOriginal = orig;
      const ny = orig.replace(TEMA_RE, '$1default$3');
      if (el.textContent !== ny) el.textContent = ny;
    } else if (el.dataset.nbxOriginal !== undefined) {
      el.textContent = el.dataset.nbxOriginal;
      delete el.dataset.nbxOriginal;
    }
  }
  function oppdaterStiler() {
    const på = morkAktiv();
    document.querySelectorAll('style').forEach((s) => standardtema(s, på));
  }
  // <head> leses etter at denne fila kjører: fang <style> idet den kommer, før siden tegnes
  if (document.readyState === 'loading') {
    const vakt = new MutationObserver((endringer) => {
      if (!morkAktiv()) return;
      for (const e of endringer) {
        for (const n of e.addedNodes) standardtema(n.nodeType === 3 ? n.parentNode : n, true);
        if (e.target.nodeName === 'STYLE') standardtema(e.target, true);
      }
    });
    vakt.observe(root, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', () => { vakt.disconnect(); oppdaterStiler(); }, { once: true });
  }

  try {
    const hint = localStorage.getItem(TEMA_HINT);
    if (hint === 'mork' || hint === 'morkere') root.classList.add('nbx-tema-mork');
    if (hint === 'morkere') root.classList.add('nbx-tema-morkere');
  } catch {}

  // Tekst som er UTF-8 men er lest som ISO-8859-1 («fÃ¥tt» → «fått»).
  // Rører bare tekst som hele veien kan leses tilbake som gyldig UTF-8.
  const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
    0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94,
    0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  function fiksTegn(tekst) {
    if (!/[\u00C2\u00C3][\u0080-\u00BF\u0152-\u2122]/.test(tekst)) return tekst;
    const bytes = [];
    for (const ch of tekst) {
      const c = ch.codePointAt(0);
      if (c < 0x100) bytes.push(c);
      else if (CP1252[c] !== undefined) bytes.push(CP1252[c]);
      else return tekst;
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch { return tekst; }
  }

  const JUSTERINGER = [
    // Hver justering er et objekt. «sider» er valgfritt (utelates = alle sider).
    {
      navn: 'Rett æøå i meldingsmaler',
      // Malene i «Velg en mal» (f.eks. «Invite» når du svarer i Staffbox) kommer fra
      // ajax.php?a=tpl som UTF-8, men siden sier at de er ISO-8859-1. Rettes i tekstfeltet.
      kjør() {
        const fiks = (ta) => {
          const ny = fiksTegn(ta.value);
          if (ny !== ta.value) ta.value = ny;
        };
        document.addEventListener('focusin', (e) => { if (e.target instanceof HTMLTextAreaElement) fiks(e.target); });
        const mal = document.getElementById('mal');
        if (mal) {
          mal.addEventListener('change', () => {
            let n = 0;
            const t = setInterval(() => {
              document.querySelectorAll('textarea').forEach(fiks);
              if (++n > 25) clearInterval(t);
            }, 120);
          });
        }
      },
    },

    // {
    //   navn: 'Eksempel: marker egne torrents',
    //   sider: ['browse'],
    //   kjør() {
    //     document.querySelectorAll('tr.owner').forEach((tr) => tr.classList.add('nbx-min'));
    //   },
    // },
  ];

  let endretSiden = false;
  function kjørAlle() {
    for (const j of [...JUSTERINGER, ...NBX.liste]) {
      if (j.sider && !j.sider.includes(side)) continue;
      endretSiden = true;
      try { j.kjør(); } catch (e) { console.warn('[Designupgrade]', j.navn, e); }
    }
  }

  // JS-justeringer kan ikke skrus av mens siden er åpen, så siden lastes på nytt
  // når du bruker bryteren (bakgrunnsfaner gjør det først når du går til dem).
  function lastPåNytt() {
    if (document.visibilityState === 'visible') location.reload();
    else document.addEventListener('visibilitychange', lastPåNytt, { once: true });
  }

  api.storage.local.get({ enabled: true, morktTema: false, morkModus: '' }).then((v) => {
    const { enabled } = v;
    setOn(enabled);
    Object.assign(temaVerdi, { morktTema: v.morktTema, morkModus: v.morkModus });
    setTema(temaVerdi.morktTema, erMorkere(temaVerdi));
    if (!enabled) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kjørAlle, { once: true });
    else kjørAlle();
  }).catch(() => {});

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.morktTema || changes.morkModus) { // bare CSS, ingen omlasting
      // Synkront, så liste.js (som lytter etterpå) måler bakgrunnen med riktig tema
      if (changes.morktTema) temaVerdi.morktTema = !!changes.morktTema.newValue;
      if (changes.morkModus) temaVerdi.morkModus = changes.morkModus.newValue || '';
      setTema(temaVerdi.morktTema, erMorkere(temaVerdi));
    }
    if (changes.visning && endretSiden) lastPåNytt(); // kort ↔ tabell i popupen
    if (!changes.enabled) return;
    setOn(changes.enabled.newValue);
    oppdaterStiler();
    if (changes.enabled.newValue === false ? endretSiden : true) lastPåNytt();
  });
})();
