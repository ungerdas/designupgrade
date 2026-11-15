const api = globalThis.browser ?? globalThis.chrome;
const $ = (id) => document.getElementById(id);
const msg = (text, cls = '') => { $('msg').textContent = text; $('msg').className = cls; };

const box = $('enabled');
const VALG = { visning: 'kort', kortStr: 'normal' };
const skjulBokser = [...document.querySelectorAll('input[name="skjulSprak"]')];
api.storage.local.get({ enabled: true, morktTema: false, morkModus: '', skjulSprak: [], tmdbKey: '', ...VALG }).then((v) => {
  const { enabled, tmdbKey } = v;
  box.checked = enabled;
  skjulBokser.forEach((b) => { b.checked = (v.skjulSprak || []).includes(b.value); });
  // Mørk modus: Av, Mørk eller Enda mørkere (eldre innstillinger har bare morktTema)
  const modus = v.morktTema ? (v.morkModus === 'morkere' ? 'morkere' : 'mork') : 'av';
  document.querySelectorAll('input[name="morkModus"]').forEach((r) => { r.checked = r.value === modus; });
  for (const navn of Object.keys(VALG)) {
    document.querySelectorAll(`input[name="${navn}"]`).forEach((r) => { r.checked = r.value === v[navn]; });
  }
  $('key').value = tmdbKey;
  if (tmdbKey) msg('Nøkkel er lagret.', 'ok');
});
box.addEventListener('change', () => api.storage.local.set({ enabled: box.checked }));
document.querySelectorAll('input[name="morkModus"]').forEach((r) => r.addEventListener('change', () => {
  api.storage.local.set({ morkModus: r.value, morktTema: r.value !== 'av' });
}));
for (const navn of Object.keys(VALG)) {
  document.querySelectorAll(`input[name="${navn}"]`).forEach((r) => r.addEventListener('change', () => api.storage.local.set({ [navn]: r.value })));
}
$('ver').textContent = 'v' + api.runtime.getManifest().version;

$('save').addEventListener('click', async () => {
  const key = $('key').value.trim();
  if (!key) {
    await api.storage.local.set({ tmdbKey: '' });
    msg('Nøkkel fjernet. Plakater og handling vises ikke.');
    return;
  }
  msg('Tester nøkkelen …');
  const r = await api.runtime.sendMessage({ type: 'tmdb-test', key }).catch(() => null);
  if (r && r.ok) {
    await api.storage.local.set({ tmdbKey: key });
    msg('Nøkkelen virker og er lagret.', 'ok');
  } else {
    msg(r && r.status === 401 ? 'TMDB godtok ikke nøkkelen.' : 'Fikk ikke kontakt med TMDB. Prøv igjen.', 'bad');
  }
});

$('clear').addEventListener('click', async () => {
  const r = await api.runtime.sendMessage({ type: 'tom-buffer' }).catch(() => null);
  msg(r ? `Tømte ${r.removed} lagrede oppslag.` : 'Klarte ikke å tømme.', r ? 'ok' : 'bad');
});
// Skjul torrenter: lagres som liste, f.eks. ['da']
skjulBokser.forEach((b) => b.addEventListener('change', () => {
  api.storage.local.set({ skjulSprak: skjulBokser.filter((x) => x.checked).map((x) => x.value) });
}));
