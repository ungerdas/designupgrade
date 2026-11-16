// Designupgrade — søk med TMDB- og IMDb-id
// ---------------------------------------------------------------
// I søkefeltet for torrents (øverst på alle sider og på torrentlista) kan du skrive
//   tmdb:603            film eller serie (finnes begge, velger du)
//   tmdb:tv:243518      serie   (tmdb:film:603 er film)
//   en lenke fra themoviedb.org, f.eks. https://www.themoviedb.org/tv/243518-spillet
//   tt30858486 eller en lenke fra imdb.com
// TMDB-id-en gjøres om til IMDb-id hos TMDB (krever TMDB-nøkkel), og siden søkes med
// sitt eget «IMDb ID»-felt. Har tittelen ingen IMDb-id, søkes det på navnet i stedet.
// I det avanserte søket på torrentlista står et «TMDB ID»-felt der «IMDb Rating» var.

(() => {
  'use strict';
  const NBX = (globalThis.NBX = globalThis.NBX || { liste: [] });
  const api = globalThis.browser ?? globalThis.chrome;

  const TYPE = { movie: 'movie', film: 'movie', tv: 'tv', serie: 'tv', series: 'tv' };
  const TYPENAVN = { movie: 'film', tv: 'serie' };

  // «tmdb:603», «tmdb:tv:243518», «tmdb serie 243518» eller en TMDB-lenke
  // → { kind: 'movie' | 'tv' | '' (ukjent), id }. utenPrefiks: «603» og «tv/243518» holder.
  function tmdbFra(tekst, utenPrefiks = false) {
    const s = String(tekst || '').trim();
    let m = s.match(/themoviedb\.org\/(movie|tv)\/(\d{1,9})/i);
    if (m) return { kind: m[1].toLowerCase(), id: m[2] };
    const type = '(?:(movie|film|tv|serie|series)\\s*[:/\\s]\\s*)?(\\d{1,9})$';
    m = s.match(new RegExp((utenPrefiks ? '^(?:tmdb\\s*[:=\\s]\\s*)?' : '^tmdb\\s*[:=\\s]\\s*') + type, 'i'));
    return m ? { kind: m[1] ? TYPE[m[1].toLowerCase()] : '', id: m[2] } : null;
  }

  // «tt30858486», «imdb:tt30858486» eller en IMDb-lenke → 'tt30858486'
  function imdbFra(tekst) {
    const s = String(tekst || '').trim();
    const m = s.match(/^(?:imdb\s*[:=\s]\s*)?(tt\d{7,9})\/?$/i) || s.match(/imdb\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?title\/(tt\d{7,9})/i);
    return m ? m[1].toLowerCase() : null;
  }

  // Torrentsøket: skjemaet øverst på alle sider (id «Torrents») og søket på torrentlista.
  // Ønsker, forum og medlemmer har egne skjemaer og røres ikke.
  const erTorrentsøk = (form) => form.id === 'Torrents' || (NBX.side === 'browse' && !!form.querySelector('input[name="imdbsearch"]'));

  // Adressen til søket. Skjemaet på torrentlista tar med alt du har valgt der
  // (kategorier, døde osv.); søket øverst sender bare søket.
  function adresse(form, { imdb = '', search = '' }) {
    const p = form.querySelector('input[name="imdbsearch"]') ? new URLSearchParams(new FormData(form)) : new URLSearchParams();
    p.set('search', search);
    p.set('imdbsearch', imdb);
    return '/browse.php?' + p.toString();
  }

  // ---------- Liten boks under søkefeltet (melding eller valg) ----------
  let boks = null;
  let lukkTid = 0;
  function lukk() {
    clearTimeout(lukkTid);
    if (boks) { boks.remove(); boks = null; }
  }
  function vis(anker, ...innhold) {
    lukk();
    boks = document.createElement('div');
    boks.className = 'nbx-idsok';
    boks.setAttribute('role', 'status');
    boks.append(...innhold);
    document.body.append(boks);
    const r = anker.getBoundingClientRect();
    const venstre = Math.max(8, Math.min(r.left, document.documentElement.clientWidth - boks.offsetWidth - 8));
    boks.style.left = venstre + scrollX + 'px';
    boks.style.top = r.bottom + scrollY + 6 + 'px';
    return boks;
  }
  function melding(anker, tekst, feil = false) {
    const b = vis(anker, tekst);
    if (feil) {
      b.classList.add('nbx-idsok-feil');
      lukkTid = setTimeout(lukk, 9000);
      anker.addEventListener('input', lukk, { once: true });
    }
  }

  // ---------- Søket ----------
  function gå(form, t, beholdSøk) {
    lukk();
    const søk = beholdSøk ? form.querySelector('input[name="search"]')?.value.trim() || '' : '';
    location.href = t.imdb ? adresse(form, { imdb: t.imdb, search: søk }) : adresse(form, { search: t.title });
  }

  async function slåOpp(form, ref, anker, beholdSøk) {
    melding(anker, 'Slår opp hos TMDB …');
    let svar = null;
    try { svar = await api.runtime.sendMessage({ type: 'tmdb-id', kind: ref.kind, id: ref.id }); } catch { svar = null; }
    if (!svar) return melding(anker, 'Fikk ikke svar fra Designupgrade. Last siden på nytt og prøv igjen.', true);
    if (svar.source === 'nokey') return melding(anker, 'Søk med TMDB-id krever en TMDB-nøkkel. Legg den inn i Designupgrade-popupen.', true);
    if (svar.source === 'badkey') return melding(anker, 'TMDB godtok ikke nøkkelen. Sjekk den i Designupgrade-popupen.', true);
    const treff = svar.treff || [];
    if (!treff.length) {
      const hva = ref.kind ? TYPENAVN[ref.kind] : 'film eller serie';
      return melding(anker, svar.error ? 'Fikk ikke kontakt med TMDB. Prøv igjen.' : `TMDB har ingen ${hva} med id ${ref.id}.`, true);
    }
    if (treff.length === 1) return gå(form, treff[0], beholdSøk);
    // Film og serie har hver sin nummerserie, så samme id kan være begge deler
    const tekst = document.createElement('div');
    tekst.textContent = `TMDB-id ${ref.id} er både en film og en serie:`;
    const knapper = treff.map((t) => {
      const k = document.createElement('button');
      k.type = 'button';
      k.textContent = `${t.kind === 'tv' ? 'Serie' : 'Film'}: ${t.title}${t.year ? ` (${t.year})` : ''}`;
      k.addEventListener('click', () => gå(form, t, beholdSøk));
      return k;
    });
    vis(anker, tekst, ...knapper);
    knapper[0].focus();
  }

  function påSend(e) {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !erTorrentsøk(form)) return;
    const felt = form.querySelector('input[name="search"]');
    const tekst = felt ? felt.value : '';
    const imdb = imdbFra(tekst);
    let ref = imdb ? null : tmdbFra(tekst);
    let anker = felt;
    let beholdSøk = false;
    if (!imdb && !ref) {
      // TMDB-feltet i det avanserte søket. Teksten i søkefeltet beholdes da, som med IMDb ID.
      const tmdbFelt = form.querySelector('input.nbx-tmdb-felt');
      if (!tmdbFelt || !tmdbFelt.value.trim()) return;
      e.preventDefault();
      ref = tmdbFra(tmdbFelt.value, true);
      if (!ref) return melding(tmdbFelt, 'Skriv en TMDB-id (f.eks. 603 eller tv/243518) eller lim inn en lenke fra themoviedb.org.', true);
      anker = tmdbFelt;
      beholdSøk = true;
    }
    e.preventDefault();
    if (imdb) {
      location.href = adresse(form, { imdb });
      return;
    }
    slåOpp(form, ref, anker, beholdSøk);
  }

  // «TMDB ID» ved siden av «IMDb ID» i det avanserte søket, der «IMDb Rating» (fra/til)
  // sto. Feltet har ikke navn, så det sendes aldri til siden; det gjøres om til IMDb-id
  // når du søker. Ratingboksen fjernes helt (ikke bare skjules), så et filter fra
  // adressen ikke sendes med usynlig neste gang.
  function tmdbBoks() {
    const imdbBoks = document.querySelector('#content form input[name="imdbsearch"]')?.closest('.adva_box');
    if (!imdbBoks || imdbBoks.parentElement.querySelector('.nbx-tmdb-boks')) return;
    imdbBoks.parentElement.querySelector('select[name="imdb_from"]')?.closest('.adva_box')?.remove();
    const ny = document.createElement('div');
    ny.className = 'adva_box nbx-tmdb-boks';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'nbx-tmdb-felt';
    inp.placeholder = 'Lenke eller id';
    inp.title = 'TMDB-id (f.eks. 603 eller tv/243518) eller lenke fra themoviedb.org. Gjøres om til IMDb-id når du søker.';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    ny.append('TMDB ID', document.createElement('br'), inp);
    imdbBoks.after(ny);
  }

  NBX.liste.push({
    navn: 'Søk med TMDB- og IMDb-id',
    kjør() {
      document.addEventListener('submit', påSend, true);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lukk(); });
      document.addEventListener('pointerdown', (e) => { if (boks && !boks.contains(e.target)) lukk(); }, true);
      if (NBX.side === 'browse') tmdbBoks();
    },
  });
})();
