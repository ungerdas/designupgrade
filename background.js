// Designupgrade — bakgrunn (Firefox)
// 1) Henter plakat og handling fra TMDB med brukerens egen nøkkel, og husker
//    svaret i 30 dager.
// 2) Henter cover og albuminfo for musikk fra Deezer (og MusicBrainz), uten nøkkel.
// 3) Henter omslag, omtale og oppleser for lydbøker fra Nasjonalbiblioteket, uten nøkkel.
// 4) Bare under utvikling: laster utvidelsen på nytt når build.txt i mappen
//    endres. Den delen fjernes av tools/lag-utgave.py i den publiserte utgaven.

const api = globalThis.browser ?? globalThis.chrome;

// ---------------------------------------------------------------------------
// Plakat og handling
// ---------------------------------------------------------------------------
const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';
const KEEP_DAYS = 30;
const MISS_DAYS = 3;

const STATUS = {
  'Returning Series': 'Pågående', Ended: 'Avsluttet', Canceled: 'Avlyst',
  'In Production': 'I produksjon', Planned: 'Planlagt', Pilot: 'Pilot',
  Released: '', 'Post Production': 'Etterarbeid', Rumored: 'Ryktet',
};

async function getKey() {
  const { tmdbKey } = await api.storage.local.get({ tmdbKey: '' });
  return (tmdbKey || '').trim();
}

async function tmdb(path, key, params = {}) {
  const url = new URL(TMDB_API + path);
  const headers = { accept: 'application/json' };
  // v4 «Read Access Token» er en lang JWT; v3 «API Key» er 32 tegn
  if (key.length > 40) headers.Authorization = 'Bearer ' + key;
  else url.searchParams.set('api_key', key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = new Error('TMDB ' + res.status);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fromTmdb(imdb, key) {
  const found = await tmdb('/find/' + imdb, key, { external_source: 'imdb_id', language: 'nb-NO' });
  let kind = 'movie';
  let id = found.movie_results?.[0]?.id;
  if (!id && found.tv_results?.[0]) { id = found.tv_results[0].id; kind = 'tv'; }
  if (!id && found.tv_episode_results?.[0]) { id = found.tv_episode_results[0].show_id; kind = 'tv'; } // episode → serien
  if (!id) return null;
  return tmdbDetails(kind, id, key, imdb);
}

// Rekkefølgen beskrivelser velges i: norsk («no»), bokmål, nynorsk, så originalspråket
// hvis det er engelsk, dansk eller svensk (engelsk serie → engelsk, dansk serie → dansk),
// ellers engelsk, dansk og svensk.
// Mange norske titler har beskrivelsen under «no» og ikke «nb», så alle oversettelsene
// hentes i samme oppslag.
const NORSK = ['no', 'nb', 'nn'];
function besteBeskrivelse(d) {
  const tr = d.translations?.translations || [];
  const LESBARE = ['en', 'da', 'sv'];
  const orig = LESBARE.includes(d.original_language) ? d.original_language : '';
  const rekkefolge = [...new Set([...NORSK, orig, ...LESBARE].filter(Boolean))];
  for (const sprak of rekkefolge) {
    const hit = tr.find((x) => x.iso_639_1 === sprak && x.data?.overview?.trim());
    if (hit) return hit.data.overview.trim();
  }
  return d.overview || tr.find((x) => x.data?.overview?.trim())?.data.overview.trim() || '';
}

// Versjon på bufferinnholdet. Treff lagret med eldre versjon hentes på nytt én gang (se gammel()).
const DATA_V = 4;

async function tmdbDetails(kind, id, key, imdb) {
  const d = await tmdb(`/${kind}/${id}`, key, { language: 'nb-NO', append_to_response: 'external_ids,translations' });
  const overview = besteBeskrivelse(d);
  return {
    source: 'tmdb',
    v: DATA_V,
    kind,
    imdb: imdb || d.external_ids?.imdb_id || null,
    tmdbId: id,
    tvdbId: d.external_ids?.tvdb_id || null,
    title: d.title || d.name || '',
    year: (d.release_date || d.first_air_date || '').slice(0, 4),
    overview,
    genres: (d.genres || []).map((g) => g.name).slice(0, 5),
    status: STATUS[d.status] ?? '',
    seasons: d.number_of_seasons || 0,
    episodes: d.number_of_episodes || 0,
    runtime: d.runtime || d.episode_run_time?.[0] || 0,
    vote: d.vote_average ? Math.round(d.vote_average * 10) / 10 : 0,
    poster: d.poster_path ? TMDB_IMG + 'w500' + d.poster_path : null,
    thumb: d.poster_path ? TMDB_IMG + 'w154' + d.poster_path : null,
    backdrop: d.backdrop_path ? TMDB_IMG + 'w1280' + d.backdrop_path : null,
  };
}

// Uten IMDb-id (f.eks. norske programmer): søk på tittel (og år) hos TMDB
async function fromTitle(title, year, kind, key) {
  const params = { query: title, language: 'nb-NO', include_adult: 'false' };
  let path = '/search/multi';
  if (kind === 'tv') { path = '/search/tv'; if (year) params.first_air_date_year = year; }
  if (kind === 'movie') { path = '/search/movie'; if (year) params.year = year; }
  const res = await tmdb(path, key, params);
  const hits = (res.results || []).filter((r) => !r.media_type || r.media_type === 'tv' || r.media_type === 'movie');
  const hit = hits[0];
  if (!hit) return null;
  return tmdbDetails(hit.media_type || kind || 'movie', hit.id, key, null);
}

// Treff lagret før gjeldende språkrekkefølge (DATA_V) hentes på nytt
const gammel = (cached) => cached?.data?.source === 'tmdb' && (cached.data.v || 0) < DATA_V;

async function film(imdb) {
  const cacheKey = 'f:' + imdb;
  const key = await getKey();
  if (!key) return { imdb, source: 'nokey' };
  const cached = (await api.storage.local.get(cacheKey))[cacheKey];
  if (cached) {
    const age = Date.now() - cached.t;
    const stale = cached.miss ? age > MISS_DAYS * 864e5 : age > KEEP_DAYS * 864e5;
    if (!stale && cached.data?.source !== 'imdb' && !gammel(cached)) return cached.data || { imdb, source: 'none' };
  }
  let data = null;
  try { data = await fromTmdb(imdb, key); } catch { return { imdb, source: 'none' }; } // nettverk/feil nøkkel: prøv igjen neste gang
  await api.storage.local.set({ [cacheKey]: data ? { t: Date.now(), data } : { t: Date.now(), miss: true } });
  return data || { imdb, source: 'none' };
}

async function filmFromTitle(title, year, kind) {
  const key = await getKey();
  if (!key) return { source: 'nokey' };
  if (!title) return { source: 'none' };
  const cacheKey = 's:' + [kind || '', title.toLowerCase(), year || ''].join('|');
  const cached = (await api.storage.local.get(cacheKey))[cacheKey];
  if (cached) {
    const age = Date.now() - cached.t;
    if (age < (cached.miss ? MISS_DAYS : KEEP_DAYS) * 864e5 && !gammel(cached)) return cached.data || { source: 'none' };
  }
  let data = null;
  try { data = await fromTitle(title, year, kind, key); } catch { return { source: 'none' }; }
  await api.storage.local.set({ [cacheKey]: data ? { t: Date.now(), data } : { t: Date.now(), miss: true } });
  return data || { source: 'none' };
}

// IMDb-id først. Kjenner ikke TMDB den (nye serier/sesonger mangler ofte koblingen),
// eller finnes det ingen, søkes det på tittel (og år).
async function finnFilm(msg) {
  const imdb = /^tt\d{7,9}$/.test(msg.imdb || '') ? msg.imdb : '';
  const title = msg.title ? String(msg.title).slice(0, 120) : '';
  const year = /^\d{4}$/.test(msg.year || '') ? msg.year : '';
  const kind = ['tv', 'movie'].includes(msg.kind) ? msg.kind : '';
  if (!imdb) return filmFromTitle(title, year, kind);
  const data = await film(imdb);
  if (data.source === 'none' && title) {
    const viaTitle = await filmFromTitle(title, year, kind);
    if (viaTitle.source === 'tmdb') return { ...viaTitle, imdb };
  }
  return data;
}

// ---------------------------------------------------------------------------
// Musikk: cover og albuminfo fra Deezer. Finner ikke Deezer albumet, spørres
// MusicBrainz (cover fra Cover Art Archive). Ingen nøkkel trengs. Bare artist og
// albumtittel fra releasenavnet sendes.
// ---------------------------------------------------------------------------
const DEEZER = 'https://api.deezer.com';
const MUSICBRAINZ = 'https://musicbrainz.org/ws/2';
const CAA = 'https://coverartarchive.org';
const MUSIKK_V = 1;

// Kallene spres utover: Deezer tåler 50 kall per 5 sekunder, MusicBrainz ett i sekundet
function kø(mellomrom) {
  let neste = 0;
  return async (fn) => {
    const nå = Date.now();
    const start = Math.max(nå, neste);
    neste = start + mellomrom;
    if (start > nå) await new Promise((r) => setTimeout(r, start - nå));
    return fn();
  };
}
const deezerKø = kø(130);
const mbKø = kø(1100);

function deezer(sti, params = {}) {
  return deezerKø(async () => {
    const url = new URL(DEEZER + sti);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Deezer ' + res.status);
    const svar = await res.json();
    if (svar.error) throw new Error('Deezer ' + (svar.error.code ?? svar.error.type)); // 4 = for mange kall
    return svar;
  });
}

// MusicBrainz svarer 503 («busy») når serveren har mye å gjøre: ett nytt forsøk, så gis det opp
// (uten å huske det som «ikke funnet»)
function musicbrainz(sti, params = {}) {
  return mbKø(async () => {
    const url = new URL(MUSICBRAINZ + sti);
    for (const [k, v] of Object.entries({ ...params, fmt: 'json' })) url.searchParams.set(k, v);
    for (let forsøk = 0; ; forsøk++) {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (res.status === 503 && forsøk < 1) { await new Promise((r) => setTimeout(r, 2500)); continue; }
      if (!res.ok) throw new Error('MusicBrainz ' + res.status);
      const svar = await res.json();
      if (svar.error) throw new Error('MusicBrainz ' + svar.error);
      return svar;
    }
  });
}

// ---- Releasenavnet: artist, album, år og type ----
// Navnene på siden følger flere mønstre:
//   «Artist - Album (2005)», «Artist - Album 2025 CD FLAC 16-bit 44.1 kHz-GRUPPE»,
//   «Artist-Album-WEB-2024-GRUPPE», «Artist - Album-SINGLE-WEB-NO-2023-GRUPPE»,
//   «Artist.Album.Live.2014.FLAC», «Artist - Diskografi 2009-2025», «VA - Samling (2000)»
const TAGG = new Set(('web webflac web-flac flac mp3 aac alac ogg opus wav dsd cd cdr cdm cds cdep cda 2cd 3cd 4cd 5cd 6cd 7cd 8cd 9cd 10cd ' +
  'vinyl lp 2lp 3lp ep single singel split boxset box remastered remaster deluxe edition limited digipak bonus retail promo proper repack ' +
  'reissue no nor norway norwegian se dk fi int 16bit 24bit 32bit 16-bit 24-bit hi-res hires v0 v2 320 256 192 160 128 vbr cbr kbps ' +
  'hdtracks tidal qobuz itunes spotify bandcamp dl download webdl web-dl tape kassett cassette mc dvd bd bluray sacd hdcd').split(' '));
const erTagg = (t) => TAGG.has(t.toLowerCase()) || /^\d{2,3}(\.\d)?k?hz$/i.test(t) || /^\d{2}bit$/i.test(t) || /^\d+cd$/i.test(t) || /^mp3\/\d+/i.test(t);
const erÅr = (t) => /^(19|20)\d{2}$/.test(t);
const VA = /^(va|v\.a\.|various|various artists|diverse|diverse artister|div\.? artister|blandet|samleplate)$/i;
const DISKO = /\b(diskografi|discografi|discography|diskografien|samlede verk|complete discography)\b/i;
const fjernKlammer = (s) => s.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ');

// Prikker som ordskille: «Hellbillies.LEVANDE.Live.2014.FLAC», «Chris.Holsten - Bak.en.fasade.(2022)»
const prikker = (s) => s.split(' - ').map((del) => (/\s/.test(del.trim()) ? del : del.replace(/(?<=[^\s.])\.(?=[^\s.])/g, ' '))).join(' - ');

// Scene-stil uten mellomrom rundt bindestrek: delene før første merking (WEB, CD, FLAC …), og året
function sceneDeler(s, minDeler = 2) {
  s = s.replace(/\((?:WEB|CD)\)|\((?=[^)\s]*\d)[A-Za-z0-9.-]{3,}\)/gi, ' '); // «(BH1800-0)», «(5404027349916)», «(WEB)»
  const ut = [];
  let år = '';
  let ferdig = false;
  for (const d of s.split('-').map((x) => x.trim()).filter(Boolean)) {
    if (erÅr(d)) { år = år || d; ferdig = true; continue; }
    if (ferdig) continue;
    if (/^[A-Z]{2,}\d[A-Z0-9]*$/.test(d) && ut.length && ut.length >= minDeler - 1) continue; // katalognummer (DOG117D)
    if (ut.length && d.split(/\s+/).every(erTagg)) { ferdig = true; continue; }
    ut.push(d);
  }
  return { deler: ut, år };
}

function musikkFraNavn(navn) {
  let s = prikker(String(navn).replace(/\.(zip|rar|flac|mp3)$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim());
  const paren = [...s.matchAll(/\(\s*((?:19|20)\d{2})\s*\)/g)];
  let år = paren.length ? paren[paren.length - 1][1] : '';
  const disko = DISKO.test(s);
  let artist = '';
  let album = '';
  let scene = false;

  // Uten «Artist - Album»: alt etter (år) er katalognummer og format
  if (paren.length && !/\s[-–—]\s/.test(s)) s = s.slice(0, s.lastIndexOf(paren[paren.length - 1][0]));
  const skille = s.match(/\s+[-–—]\s+/);
  if (skille) {
    artist = s.slice(0, skille.index).trim();
    album = s.slice(skille.index + skille[0].length).trim();
    if (/-(?:\(?[A-Z0-9]+\)?)-/.test(album) || /-((19|20)\d{2})-[\w.]+$/.test(album) || /-(WEB|CD|FLAC|SINGLE|EP)\b/i.test(album)) {
      const sd = sceneDeler(fjernKlammer(album), 1);
      if (sd.deler.length) { album = sd.deler.join(' - '); scene = true; år = år || sd.år; }
    }
  } else if (/\S-\S/.test(s)) {
    const sd = sceneDeler(fjernKlammer(s));
    if (sd.deler.length >= 2) { artist = sd.deler[0]; album = sd.deler.slice(1).join(' '); scene = true; år = år || sd.år; }
    else album = sd.deler.join(' ');
  } else {
    album = s;
  }

  if (paren.length && !scene) {
    const sist = album.lastIndexOf(paren[paren.length - 1][0]);
    if (sist > 0) album = album.slice(0, sist);
  }
  album = fjernKlammer(album).replace(/\s+/g, ' ').trim()
    .replace(/\(\s*(?:19|20)\d{2}[^)]*\)/g, ' ') // «(2017 Remastered + Bonus Album)»
    .replace(/\s(?:19|20)\d{2}\s+(CD|WEB|FLAC|MP3)\b.*$/i, (m) => { år = år || m.trim().slice(0, 4); return ' '; }) // «Utenom 2024 CD FLAC …»
    .replace(/\s(?:19|20)\d{2}$/, (m) => { år = år || m.trim(); return ' '; }) // «Age of Kørka 2022»
    .replace(/\s(FLAC|MP3|CD|WEB)(\s.*)?$/i, ' ')
    .replace(/[([]\s*$/, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–]\s*$/, '')
    .trim();
  artist = fjernKlammer(artist).replace(/\(\s*(?:19|20)\d{2}\s*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!artist && disko) { // «Radka Tonef Diskografi»
    artist = album.replace(DISKO, ' ').replace(/\b(19|20)\d{2}\s*-\s*(19|20)\d{2}\b/g, ' ').replace(/\bMP3\S*/i, ' ').replace(/\s+/g, ' ').trim();
  }
  const va = VA.test(artist);
  const type = disko ? 'diskografi' : /\b(single|singel|maxi single)\b/i.test(navn) ? 'singel' : /(^|[-\s])EP([-\s]|$)/.test(navn) ? 'ep' : '';
  return { artist: va ? '' : artist, album: disko ? '' : album, år, va, type, scene };
}

// ---- Sammenligning ----
// Små bokstaver uten aksenter (ø→o, æ→ae), uten apostrofer, «Vol. III» = «Volume 3»
const ROMERSK = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10' };
const norm = (s) => String(s || '').toLowerCase()
  .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a').replace(/ß/g, 'ss').replace(/&/g, ' and ')
  .normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/['‘’`´]/g, '')
  .replace(/\b(vol(?:ume)?|part|pt|del)\b\.?\s*([ivx]+|\d+)\b/g, (_, o, n) => `vol ${ROMERSK[n] || n}`)
  .replace(/[^a-z0-9]+/g, ' ').trim();
const ord = (s) => norm(s).split(' ').filter((w) => w && !['the', 'and', 'og', 'feat', 'ft', 'x', 'with', 'vs'].includes(w));
// Utgavemerking som ikke skal telle: «(Remastered)», «(Deluxe Edition)», «- EP»
const rensTittel = (t) => String(t).replace(/\s*[([][^)\]]*(remaster|deluxe|edition|version|expanded|anniversary|bonus|mono|stereo|explicit|utgave|single|\bep\b)[^)\]]*[)\]]/gi, ' ').replace(/\s+-\s+(single|ep)$/i, '');
const VA_NAVN = /^(various artists|various|diverse artister|verschiedene interpreten|va)$/i;

// 0 = ikke samme utgivelse. Ellers høyere jo bedre.
function musikkPoeng(k, p) {
  const qa = ord(p.artist);
  const qt = ord(p.album);
  const qall = new Set([...qa, ...qt]);
  const ca = ord(k.artist);
  const ct = ord(rensTittel(k.title));
  if (!ct.length || !qall.size) return 0;
  const tittel = ct.filter((w) => qall.has(w)).length / ct.length; // kandidatens tittel står i navnet
  const kAlle = new Set([...ca, ...ct]);
  const alle = [...qall].filter((w) => kAlle.has(w)).length / qall.size; // navnet står i kandidaten
  const artist = p.va ? (VA_NAVN.test(String(k.artist).trim()) ? 1 : 0.5) : ca.length ? ca.filter((w) => qall.has(w)).length / ca.length : 0;
  if (tittel < 0.8 || alle < 0.5 || artist < 0.5) return 0;
  // «Artist - Album» er sikkert delt: albumtittelen må finnes i kandidatens tittel
  if (!p.scene && qt.length) {
    const ctSett = new Set(ct);
    if (qt.filter((w) => ctSett.has(w)).length / qt.length < 0.6) return 0;
  }
  if (p.va && p.år && k.år && Math.abs(+p.år - +k.år) > 1) return 0; // samlinger: året må stemme
  let s = tittel * 2 + alle + artist;
  if (p.år && k.år && Math.abs(+p.år - +k.år) <= 1) s += 0.4;
  if (p.type && k.type && p.type === k.type) s += 0.2;
  return s;
}

const DZ_TYPE = { album: 'album', single: 'singel', ep: 'ep', compile: 'samling' };
const MB_TYPE = { album: 'album', single: 'singel', ep: 'ep', broadcast: 'album', other: '' };
const SJANGER = {
  Pop: 'Pop', 'Rap/Hip Hop': 'Hiphop', Rock: 'Rock', Dance: 'Dans', 'R&B': 'R&B', Alternative: 'Alternativ', Christian: 'Kristen',
  Electro: 'Elektronika', Folk: 'Folk', Reggae: 'Reggae', Jazz: 'Jazz', Country: 'Country', Classical: 'Klassisk', 'Films/Games': 'Film og spill',
  Metal: 'Metal', 'Soul & Funk': 'Soul og funk', Blues: 'Blues', Kids: 'Barn', 'Latin Music': 'Latin', 'Singer & Songwriter': 'Visesang',
  'Hard Rock': 'Hardrock', 'Indie Rock': 'Indierock', 'Indie Pop': 'Indiepop', 'Techno/House': 'Techno og house', Comedy: 'Humor',
  'African Music': 'Afrikansk', 'Asian Music': 'Asiatisk', 'Brazilian Music': 'Brasiliansk', 'Indian Music': 'Indisk', 'Electro Pop/Electro Rock': 'Elektropop',
};
const sjanger = (g) => SJANGER[g] || g.charAt(0).toUpperCase() + g.slice(1);
const ordListe = (s) => String(s || '').replace(/[()[\]{}"!?.,:;]/g, ' ').split(/\s+/).filter((w) => w && !/^(-|–|&|x|feat\.?|ft\.?|og|and|vs\.?)$/i.test(w));

// Deezer: flere søk, fra det strengeste til det løseste, til ett treffer
async function deezerAlbum(p) {
  const forsøk = [];
  if (p.artist && p.album) forsøk.push(`artist:"${p.artist.replace(/"/g, '')}" album:"${p.album.replace(/"/g, '')}"`);
  forsøk.push([...ordListe(p.artist), ...ordListe(p.album)].join(' '));
  if (ordListe(p.album).length >= 2 || p.album.length >= 6) forsøk.push(ordListe(p.album).join(' '));
  if (ordListe(p.artist).length > 1) forsøk.push([ordListe(p.artist)[0], ...ordListe(p.album)].join(' '));
  for (const q of [...new Set(forsøk)].filter((x) => x.trim())) {
    let best = null;
    for (const a of (await deezer('/search/album', { q, limit: 15 })).data || []) {
      if (!a.md5_image) continue; // uten cover
      const s = musikkPoeng({ title: a.title, artist: a.artist?.name || '', type: DZ_TYPE[a.record_type] || '' }, p);
      if (s && (!best || s > best.s)) best = { a, s };
    }
    if (best) {
      const a = best.a;
      return {
        source: 'deezer', v: MUSIKK_V, kind: 'album', id: a.id,
        artist: a.artist?.name || '', title: a.title, type: DZ_TYPE[a.record_type] || '', tracks: a.nb_tracks || 0,
        cover: a.cover_big, thumb: a.cover_medium, // 500 og 250 piksler
        link: a.link || `https://www.deezer.com/album/${a.id}`, artistLink: a.artist?.link || '',
      };
    }
  }
  return null;
}

async function deezerAlbumDetaljer(data) {
  const a = await deezer('/album/' + data.id);
  let spor = a.tracks?.data || [];
  if ((a.nb_tracks || 0) > spor.length) spor = (await deezer(`/album/${data.id}/tracks`, { limit: 100 })).data || spor; // albumet gir bare 25
  return {
    ...data, detaljer: true,
    year: (a.release_date || '').slice(0, 4), date: a.release_date || '',
    genres: (a.genres?.data || []).map((g) => sjanger(g.name)).slice(0, 4),
    label: a.label || '', tracks: a.nb_tracks || data.tracks, duration: a.duration || 0, fans: a.fans || 0,
    spor: spor.slice(0, 100).map((t) => [t.title_short || t.title, t.duration || 0]),
  };
}

// «Diskografi»: artisten, med bilde og albumliste
async function deezerArtist(p) {
  const mål = ord(p.artist).join(' ');
  if (!mål) return null;
  const treff = ((await deezer('/search/artist', { q: p.artist, limit: 10 })).data || [])
    .filter((a) => ord(a.name).join(' ') === mål)
    .sort((a, b) => (b.nb_fan || 0) - (a.nb_fan || 0))[0];
  if (!treff) return null;
  return {
    source: 'deezer', v: MUSIKK_V, kind: 'artist', id: treff.id, artist: treff.name, title: treff.name,
    albums: treff.nb_album || 0, fans: treff.nb_fan || 0,
    cover: treff.picture_big, thumb: treff.picture_medium, link: treff.link || `https://www.deezer.com/artist/${treff.id}`,
  };
}

async function deezerArtistDetaljer(data) {
  const svar = await deezer(`/artist/${data.id}/albums`, { limit: 100 });
  const album = (svar.data || [])
    .filter((a) => a.record_type === 'album')
    .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))
    .map((a) => [a.title, (a.release_date || '').slice(0, 4)]);
  return { ...data, detaljer: true, album: album.slice(0, 60) };
}

// MusicBrainz: eldre og smalere utgivelser som Deezer ikke har
async function mbAlbum(p) {
  if (!p.album) return null;
  const esc = (s) => s.replace(/([+\-&|!(){}[\]^"~*?:\\/])/g, '\\$1');
  const deler = [`releasegroup:(${esc(p.album)})`];
  if (p.artist) deler.push(`artist:(${esc(p.artist)})`);
  let best = null;
  for (const g of (await musicbrainz('/release-group/', { query: deler.join(' AND '), limit: 10 }))['release-groups'] || []) {
    const k = {
      title: g.title, artist: (g['artist-credit'] || []).map((a) => a.name + (a.joinphrase || '')).join(''),
      år: (g['first-release-date'] || '').slice(0, 4), type: MB_TYPE[(g['primary-type'] || '').toLowerCase()] ?? '',
    };
    const s = musikkPoeng(k, p);
    if (s && (!best || s > best.s)) best = { g, k, s };
  }
  if (!best) return null;
  const id = best.g.id;
  return {
    source: 'musicbrainz', v: MUSIKK_V, kind: 'album', id,
    artist: best.k.artist, title: best.k.title, type: best.k.type, year: best.k.år, date: best.g['first-release-date'] || '',
    // Miniatyrene mangler for noen cover: da brukes originalbildet (coverFull)
    cover: `${CAA}/release-group/${id}/front-500`, thumb: `${CAA}/release-group/${id}/front-250`, coverFull: `${CAA}/release-group/${id}/front`,
    link: `https://musicbrainz.org/release-group/${id}`,
  };
}

async function mbAlbumDetaljer(data) {
  const g = await musicbrainz('/release-group/' + data.id, { inc: 'genres+releases' });
  const genres = (g.genres || []).sort((a, b) => b.count - a.count).map((x) => sjanger(x.name)).slice(0, 4);
  const utg = (g.releases || []).filter((r) => !r.status || r.status === 'Official').sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0];
  const ut = { ...data, detaljer: true, genres };
  if (utg) {
    const r = await musicbrainz('/release/' + utg.id, { inc: 'recordings+labels' });
    const spor = (r.media || []).flatMap((m) => (m.tracks || []).map((t) => [t.title, Math.round((t.length || 0) / 1000)]));
    Object.assign(ut, {
      label: r['label-info']?.find((l) => l.label?.name)?.label.name || '',
      tracks: spor.length, duration: spor.reduce((sum, [, l]) => sum + l, 0), spor: spor.slice(0, 100),
    });
  }
  return ut;
}

// Firefox gir ikke nye vertstillatelser når en MV3-utvidelse oppdateres (bare ved ny
// installasjon). MusicBrainz og Nasjonalbiblioteket svarer likevel (CORS), men Deezer
// gjør det ikke. Uten tilgang til Deezer brukes MusicBrainz, og popupen viser en knapp
// som ber om tilgangen.
async function harDeezer() {
  try { return await api.permissions.contains({ origins: [DEEZER + '/*'] }); } catch { return true; }
}

async function finnMusikk(msg) {
  const p = musikkFraNavn(String(msg.navn || '').slice(0, 300));
  const tolket = { artist: p.artist, album: p.album, year: p.år, type: p.type, va: p.va };
  const deezerOk = await harDeezer();
  const artistOppslag = p.type === 'diskografi';
  if (artistOppslag ? !p.artist : !p.album) return { source: 'none', tolket };
  const nøkkel = 'mu:' + (artistOppslag ? ['artist', norm(p.artist)] : ['album', norm(p.artist), norm(p.album), p.va ? 'va' : '', p.år]).join('|');

  const lagret = (await api.storage.local.get(nøkkel))[nøkkel];
  const fersk = lagret && Date.now() - lagret.t < (lagret.miss ? MISS_DAYS : KEEP_DAYS) * 864e5 && (lagret.miss || lagret.data?.v === MUSIKK_V);
  let data = fersk ? lagret.data : null;
  if (fersk && lagret.miss) return { source: 'none', tolket };
  if (!data) {
    try {
      if (artistOppslag) data = deezerOk ? await deezerArtist(p) : null;
      else data = (deezerOk ? await deezerAlbum(p) : null) || (await mbAlbum(p));
    } catch {
      return { source: 'none', tolket, manglerTilgang: !deezerOk }; // nettverk eller for mange kall: prøv igjen neste gang
    }
    // Uten Deezer huskes ikke «ikke funnet», så det prøves igjen når tilgangen er gitt
    if (data || deezerOk) await api.storage.local.set({ [nøkkel]: data ? { t: Date.now(), data } : { t: Date.now(), miss: true } });
    if (!data) return { source: 'none', tolket, manglerTilgang: !deezerOk };
  }
  if (msg.detaljer && !data.detaljer) {
    try {
      if (data.kind === 'artist') data = await deezerArtistDetaljer(data);
      else data = data.source === 'deezer' ? await deezerAlbumDetaljer(data) : await mbAlbumDetaljer(data);
      await api.storage.local.set({ [nøkkel]: { t: Date.now(), data } });
    } catch { /* vis det vi har, prøv detaljene igjen neste gang */ }
  }
  return { ...data, tolket };
}

// ---------------------------------------------------------------------------
// Lydbøker: omslag, omtale, sjangre, forlag og oppleser fra Nasjonalbiblioteket
// (api.nb.no), som har nesten alle bøker utgitt i Norge. Ingen nøkkel. Bare
// forfatter og tittel fra releasenavnet sendes.
// ---------------------------------------------------------------------------
const NB_API = 'https://api.nb.no/catalog/v1/items';
const BOK_V = 1;
const nbKø = kø(250);

function nb(sti = '', params = {}) {
  return nbKø(async () => {
    const url = new URL(NB_API + sti);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error('NB ' + res.status);
    return res.json();
  });
}

// ---- Releasenavnet: forfatter, tittel, år ----
// «Forfatter - Tittel», «Forfatter - Serie - Tittel (13)», «Etternavn, Fornavn - Tittel»,
// «Forfatter - Tittel - 2025 - M4B - 128kbps», «Forfatter - Tittel (2019) [MP3/64]»,
// «Tittel - Forfatter» (prøves omvendt), samlepakker «(1-3)» slås ikke opp.
function bokFraNavn(navn) {
  let år = '';
  let s = String(navn).replace(/_+/g, ' ');
  const pakke = /\(\s*\d+\s*-\s*\d+\s*\)|(^|\s)\d+\s*-\s*\d+(\s|$)|\bsamlet\b|\(samling\)|\bminipack\b/i.test(s) && !/\s-\s(19|20)\d{2}\s-\s/.test(s);
  s = s
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/\((?:M4A|M4B|MP3[^)]*|Hørespill|proper|lydbok)\)/gi, ' ')
    .replace(/\s\d{2,3}\s*kp?bp?s\b.*$/i, ' ') // «320kpbs CDRip MP3 Norsk Lydbok by …»
    .replace(/\s-\s((?:18|19|20)\d{2})\s-\s.*$/, (_, y) => { år = y; return ' '; }) // « - 2025 - M4B - 128kbps»
    .replace(/[.\s-]((?:19|20)\d{2})[.\s-]*(m4b|mp3|m4a)?\s*$/i, (_, y) => { år = y; return ' '; }) // «Svanemordet.2021-m4b»
    .replace(/[.\s-](m4b|mp3|m4a|aac|flac)\s*$/i, ' ')
    .replace(/\(\s*((?:19|20)\d{2})\s*\)/g, (_, y) => { år = år || y; return ' '; })
    .replace(/\bREUPPLOAD\b|\bLYDBOK\b/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  let forfatter = '';
  let tittel = s;
  const skille = s.match(/\s+[-–]\s+/);
  if (skille) {
    forfatter = s.slice(0, skille.index).trim();
    tittel = s.slice(skille.index + skille[0].length).trim();
  }
  const komma = forfatter.match(/^([^,\s]+),\s*([^,]+)$/); // «Ambjørnsen, Ingvar»
  if (komma) forfatter = `${komma[2]} ${komma[1]}`;
  const delNr = (tittel.match(/\((\d{1,3})\)/) || [])[1] || ''; // nummer i en serie
  tittel = tittel.replace(/\(\d{1,3}\)/g, ' ').replace(/\s+/g, ' ').trim();
  return { forfatter, tittel, deler: tittel.split(/\s+[-–]\s+/), år, pakke, delNr };
}

const BOK_STOPP = new Set(['the', 'and', 'og', 'en', 'et', 'ei', 'av', 'i', 'a', 'of', 'om', 'til', 'pa', 'med', 'x', 'feat']);
// «Staalesen» = «Stålesen»: å er alt gjort om til a, aa gjøres om til a
const bokOrd = (s) => norm(s).replace(/aa/g, 'a').replace(/\b([a-z]) (?=\d)/g, '$1').split(' ').filter((w) => w && !BOK_STOPP.has(w)); // «U-2» = «U2»
const snuNavn = (n) => { const m = String(n).match(/^([^,]+),\s*(.+)$/); return (m ? `${m[2]} ${m[1]}` : String(n)).replace(/\s+/g, ' ').trim(); };
const somNavn = (n) => bokOrd(n).join(' ');

// 0 = ikke samme bok. k: { tittel, forfattere: [] }, del: tittelen som er søkt på
function bokPoeng(k, p, del) {
  const qa = bokOrd(p.forfatter);
  const qt = bokOrd(String(del).replace(/\([^)]*\)/g, ' '));
  const qall = new Set([...qa, ...bokOrd(p.tittel)]);
  const ct = bokOrd(String(k.tittel).split(/\s+:\s+|:\s/)[0]);
  if (!ct.length || !qt.length) return 0;
  const tittel = ct.filter((w) => qall.has(w)).length / ct.length;
  const ctSett = new Set(bokOrd(k.tittel));
  const dekket = qt.filter((w) => ctSett.has(w)).length / qt.length;
  const ca = new Set(bokOrd(k.forfattere.join(' ')));
  const forf = qa.length ? qa.filter((w) => ca.has(w)).length / qa.length : 1;
  if (tittel < 0.8 || dekket < 0.6 || forf < 0.5) return 0;
  return tittel * 2 + dekket + forf;
}

const NORSK_SPRÅK = new Set(['nob', 'nno', 'nor']);
const nbBilde = (it, høyde) => (it._links?.thumbnail_custom?.href || '').replace('{width},{height}', `0,${høyde}`);

async function nbBok(p) {
  const deler = p.delNr ? [p.deler[p.deler.length - 1], p.tittel] : [p.tittel, p.deler[0]];
  const omvendt = p.forfatter ? { ...p, forfatter: p.tittel, tittel: p.forfatter, deler: [p.forfatter], delNr: '' } : null;
  const forsøk = [];
  for (const del of [...new Set(deler)].filter((t) => bokOrd(t).length)) forsøk.push([p, del, true]);
  forsøk.push([p, deler[0], false]); // bare tittelen: forfatteren kan være skrevet annerledes («JRR Tolkien»)
  if (omvendt) forsøk.push([omvendt, omvendt.tittel, true]); // «Tittel - Forfatter»
  for (const [pp, del, medForfatter] of forsøk) {
    const q = [del.replace(/\([^)]*\)/g, ' '), medForfatter ? pp.forfatter : ''].join(' ').replace(/[^\p{L}\p{N}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (!q) continue;
    const svar = await nb('', { q, filter: 'mediatype:bøker', size: 25 });
    const treff = [];
    for (const it of svar._embedded?.items || []) {
      const md = it.metadata || {};
      const k = { tittel: (md.title || '').replace(/\s+/g, ' ').trim(), forfattere: (md.creators || []).map(snuNavn), år: md.originInfo?.issued || '' };
      const s = bokPoeng(k, pp, del);
      if (!s) continue;
      const språk = (md.languages || []).map((l) => l.code);
      treff.push({ it, md, k, s, norsk: !språk.length || språk.some((x) => NORSK_SPRÅK.has(x)), bilde: !!nbBilde(it, 1) });
    }
    if (!treff.length) continue;
    // Norsk utgave med omslag først, så best treff, så året i navnet, så den eldste
    const årAvstand = (t) => (pp.år && /^\d{4}/.test(t.k.år) ? Math.abs(+t.k.år.slice(0, 4) - +pp.år) : 50);
    treff.sort((a, b) => (b.norsk - a.norsk) || (b.bilde - a.bilde) || (b.s - a.s) || (årAvstand(a) - årAvstand(b)) || a.k.år.localeCompare(b.k.år));
    const { it, md, k } = treff[0];
    const [tittel, under = ''] = k.tittel.split(/\s+:\s+/);
    const forfatter = k.forfattere[0] || pp.forfatter;
    return {
      source: 'nb', v: BOK_V, kind: 'bok', id: it.id,
      title: tittel.trim(), subtitle: /^(roman|spenningsroman|kriminalroman|krim|thriller|noveller|dikt|fortelling|fortellinger|barnebok)$/i.test(under.trim()) ? '' : under.trim(),
      author: forfatter, creators: k.forfattere, year: (k.år.match(/\d{4}/) || [''])[0], publisher: md.originInfo?.publisher || '',
      cover: nbBilde(it, 600) || '', thumb: nbBilde(it, 300) || '',
      link: `https://www.nb.no/items/${it.id}`,
      // Andre norske utgaver av samme bok, for omtale når denne mangler
      utgaver: treff.filter((t) => t.it.id !== it.id && t.norsk && somNavn(t.k.tittel.split(/\s+:\s+/)[0]) === somNavn(tittel)).slice(0, 3).map((t) => t.it.id),
    };
  }
  return null;
}

// «Romanar» er nynorsk for «Romaner»: én av hver, stor forbokstav
function rensSjangre(liste) {
  const ut = [];
  const sett = new Set((liste || []).map((g) => String(g).toLowerCase()));
  for (const g of liste || []) {
    const l = String(g).toLowerCase();
    if (/ar$/.test(l) && sett.has(l.replace(/ar$/, 'er'))) continue;
    const pen = l.charAt(0).toUpperCase() + l.slice(1);
    if (!ut.includes(pen)) ut.push(pen);
  }
  return ut.slice(0, 4);
}

async function nbBokDetaljer(data) {
  let omtale = '';
  let sjangre = [];
  for (const id of [data.id, ...(data.utgaver || [])].slice(0, 3)) {
    const md = (await nb('/' + encodeURIComponent(id))).metadata || {};
    if (!sjangre.length) sjangre = rensSjangre(md.subject?.genres);
    if (md.summary) { omtale = String(md.summary).trim(); break; }
  }
  // Oppleseren står i lydbokas oppføring («lydopptak»), sammen med forfatter og oversetter
  let oppleser = '';
  let lydÅr = '';
  try {
    const p = { forfatter: data.author, tittel: data.title, deler: [data.title] };
    const svar = await nb('', { q: `${data.title} ${data.author}`, filter: 'mediatype:lydopptak', size: 10 });
    const kjente = new Set((data.creators || []).map(somNavn));
    for (const it of svar._embedded?.items || []) {
      const md = it.metadata || {};
      const k = { tittel: (md.title || '').replace(/\s+/g, ' ').trim(), forfattere: (md.creators || []).map(snuNavn) };
      if (!bokPoeng(k, p, data.title)) continue;
      const andre = k.forfattere.filter((n) => !kjente.has(somNavn(n)));
      if (andre.length) { oppleser = andre.slice(0, 2).join(' og '); lydÅr = (md.originInfo?.issued || '').slice(0, 4); break; }
    }
  } catch { /* uten oppleser */ }
  return { ...data, detaljer: true, summary: omtale, genres: sjangre, narrator: oppleser, audioYear: lydÅr };
}

async function finnLydbok(msg) {
  const p = bokFraNavn(String(msg.navn || '').slice(0, 300));
  const tolket = { author: p.forfatter, title: p.delNr ? p.deler[p.deler.length - 1] : p.tittel, year: p.år, pakke: p.pakke };
  if (p.pakke || !bokOrd(p.tittel).length) return { source: 'none', tolket };
  const nøkkel = 'lb:' + [somNavn(p.forfatter), somNavn(p.tittel), p.år].join('|');
  const lagret = (await api.storage.local.get(nøkkel))[nøkkel];
  const fersk = lagret && Date.now() - lagret.t < (lagret.miss ? MISS_DAYS : KEEP_DAYS) * 864e5 && (lagret.miss || lagret.data?.v === BOK_V);
  if (fersk && lagret.miss) return { source: 'none', tolket };
  let data = fersk ? lagret.data : null;
  if (!data) {
    try { data = await nbBok(p); } catch { return { source: 'none', tolket }; } // nettverk: prøv igjen neste gang
    await api.storage.local.set({ [nøkkel]: data ? { t: Date.now(), data } : { t: Date.now(), miss: true } });
    if (!data) return { source: 'none', tolket };
  }
  if (msg.detaljer && !data.detaljer) {
    try {
      data = await nbBokDetaljer(data);
      await api.storage.local.set({ [nøkkel]: { t: Date.now(), data } });
    } catch { /* vis det vi har */ }
  }
  return { ...data, tolket };
}

api.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'lydbok' && msg.navn) {
    finnLydbok(msg).then(reply, (e) => reply({ error: String(e) }));
    return true;
  }
  if (msg?.type === 'musikk' && msg.navn) {
    finnMusikk(msg).then(reply, (e) => reply({ error: String(e) }));
    return true;
  }
  if (msg?.type === 'film' && (msg.imdb || msg.title)) {
    finnFilm(msg).then(reply, (e) => reply({ error: String(e) }));
    return true;
  }
  if (msg?.type === 'tmdb-test') {
    tmdb('/configuration', String(msg.key || '').trim())
      .then(() => reply({ ok: true }), (e) => reply({ ok: false, status: e.status || 0 }));
    return true;
  }
  if (msg?.type === 'tom-buffer') {
    api.storage.local.get(null).then(async (all) => {
      const keys = Object.keys(all).filter((k) => k.startsWith('f:') || k.startsWith('s:') || k.startsWith('mu:') || k.startsWith('lb:'));
      if (keys.length) await api.storage.local.remove(keys);
      reply({ removed: keys.length });
    });
    return true;
  }
  return false;
});

// Rydd bort lagring fra den gamle 2.x-versjonen (temaet), men behold TMDB-nøkkelen
async function ryddGammelt() {
  const all = await api.storage.local.get(null);
  // «i:<id> = '-'» kan være feil lært fra ønskesiden i 3.7.2 og eldre, så de læres på nytt
  const old = Object.keys(all).filter((k) => /^(meta|tmdb|imdb):/.test(k) || (k.startsWith('i:') && all[k] === '-') || k === 'spraakHeleSiden');
  if (old.length) await api.storage.local.remove(old);
  try { await api.storage.sync.clear(); } catch { /* ikke brukt lenger */ }
}

// --- UTVIKLING START (fjernes i publisert utgave) ---
// Automatisk omlasting fra mappen
const BUILD_URL = api.runtime.getURL('build.txt');

async function readBuild() {
  try {
    const res = await fetch(BUILD_URL, { cache: 'no-store' });
    return res.ok ? (await res.text()).trim() : null;
  } catch {
    return null;
  }
}

async function checkForUpdate() {
  const onDisk = await readBuild();
  if (!onDisk) return;
  const { loadedBuild } = await api.storage.session.get('loadedBuild');
  if (!loadedBuild) await api.storage.session.set({ loadedBuild: onDisk });
  else if (loadedBuild !== onDisk) api.runtime.reload();
}

api.alarms.create('nbx-update-check', { periodInMinutes: 0.5 });
api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'nbx-update-check') checkForUpdate();
});
api.runtime.onStartup.addListener(checkForUpdate);
checkForUpdate();
// --- UTVIKLING SLUTT ---

api.runtime.onInstalled.addListener(() => { ryddGammelt().catch(() => {}); });
