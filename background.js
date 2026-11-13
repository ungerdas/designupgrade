// Designupgrade — bakgrunn (Firefox)
// 1) Henter plakat og handling fra TMDB med brukerens egen nøkkel, og husker
//    svaret i 30 dager.
// 2) Bare under utvikling: laster utvidelsen på nytt når build.txt i mappen
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

api.runtime.onMessage.addListener((msg, _sender, reply) => {
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
      const keys = Object.keys(all).filter((k) => k.startsWith('f:') || k.startsWith('s:'));
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
