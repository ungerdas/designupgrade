"""Lager en publiserbar Firefox-utgave av Designupgrade.

Bruk (fra mappa):   python tools/lag-utgave.py
  → dist/designupgrade-<versjon>.zip

Chrome-utgave (for å dele med Chrome-brukere, installeres som «upakket»):
  python tools/lag-utgave.py --chrome
  → dist/designupgrade-<versjon>-chrome.zip

GitHub (publiser.yml) kjører den slik:
  python tools/lag-utgave.py --update-url <adresse til updates.json> --mappe bygg
  → også en utpakket kopi i bygg/, som web-ext signerer hos AMO

Utgaven er lik mappa, bortsett fra:
  • koden mellom «UTVIKLING START» og «UTVIKLING SLUTT» i background.js
    (automatisk omlasting fra mappen) er fjernet,
  • tillatelsen «alarms» (som bare den trengte) er fjernet fra manifest.json, og
  • med --update-url får manifestet adressen Firefox sjekker for oppdateringer.
Med: bare filene utvidelsen bruker (ikke arkiv/, dist/, tools/, LES-MEG osv.).
"""
import argparse, json, pathlib, re, shutil, sys, zipfile

ROT = pathlib.Path(__file__).resolve().parent.parent
MED = ['manifest.json', 'background.js', 'justeringer.js', 'justeringer.css', 'tema-mork.css', 'plakat.js', 'plakat.css',
       'liste.js', 'liste.css', 'popup.html', 'popup.js']
MAPPER = ['icons']


CHROME_LES_MEG = """Designupgrade {versjon} for Google Chrome
========================================

Installere:
  1. Pakk ut zip-fila til en mappe du lar ligge (f.eks. Dokumenter\\Designupgrade).
  2. Åpne chrome://extensions
  3. Skru på «Utviklermodus» (øverst til høyre).
  4. Klikk «Last inn upakket» og velg mappa med manifest.json.
  5. Klikk på puslebrikken i verktøylinja, fest Designupgrade, klikk på D+ og
     lim inn en gratis TMDB-nøkkel (themoviedb.org/settings/api).

Ny versjon: last ned den nyeste …-chrome.zip fra
  https://github.com/ungerdas/designupgrade/releases
pakk den ut over den gamle mappa og trykk «Last inn på nytt» (↻) på
Designupgrade i chrome://extensions. Chrome-utgaven oppdaterer seg ikke selv.

Personvern: tittel, år og IMDb-id sendes til The Movie Database (TMDB) for å
finne plakat og handling. Ingenting sendes til utvikleren.

This product uses the TMDB API but is not endorsed or certified by TMDB.
"""


def til_chrome(manifest):
    """Chrome bruker en service worker i stedet for bakgrunnsskript, og kjenner ikke Firefox-nøklene."""
    manifest['background'] = {'service_worker': 'background.js'}
    manifest.pop('browser_specific_settings', None)
    manifest['minimum_chrome_version'] = '120'
    return manifest


def innhold(update_url, chrome=False):
    """Gir (sti, bytes) for hver fil i utgaven."""
    manifest = json.loads((ROT / 'manifest.json').read_text(encoding='utf-8'))
    manifest['permissions'] = [p for p in manifest.get('permissions', []) if p != 'alarms']
    if chrome:
        if update_url:
            sys.exit('--update-url gjelder bare Firefox')
        manifest = til_chrome(manifest)
    if update_url:
        if not update_url.startswith('https://'):
            sys.exit('--update-url må starte med https://')
        manifest['browser_specific_settings']['gecko']['update_url'] = update_url
    bakgrunn = (ROT / 'background.js').read_text(encoding='utf-8')
    bakgrunn, n = re.subn(r'// --- UTVIKLING START.*?// --- UTVIKLING SLUTT ---\n?', '', bakgrunn, flags=re.S)
    if n != 1:
        sys.exit('Fant ikke UTVIKLING START/SLUTT i background.js')
    filer = [('manifest.json', (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')),
             ('background.js', bakgrunn.encode('utf-8'))]
    for navn in MED:
        if navn not in ('manifest.json', 'background.js'):
            data = (ROT / navn).read_bytes()
            if chrome and navn == 'tema-mork.css':
                data = chrome_tema(data.decode('utf-8')).encode('utf-8')
            filer.append((navn, data))
    for mappe in MAPPER:
        for f in sorted((ROT / mappe).rglob('*')):
            if f.is_file():
                filer.append((f.relative_to(ROT).as_posix(), f.read_bytes()))
    if chrome:
        filer.append(('LES-MEG.txt', CHROME_LES_MEG.format(versjon=manifest['version']).encode('utf-8')))
    return manifest['version'], filer


# Firefox legger utvidelsens CSS etter sidens egen, så ved lik styrke vinner mørk
# modus (som i Stylus). Chrome legger den foran, så der taper den. Med en ekstra
# «html» blir hver regel så vidt sterkere (0,0,1), og Chrome får nøyaktig samme
# utfall som Firefox – mørk modus vinner når den er minst like sterk som siden.
PREFIKS = ':where(html.nbx-on.nbx-tema-mork)'
def chrome_tema(css):
    ny, n = re.subn(re.escape(PREFIKS) + r'(?=[\s{,])', 'html' + PREFIKS.replace(':where(html', ':where('), css)
    if n < 300:
        sys.exit(f'tema-mork.css: fant bare {n} regler å justere for Chrome')
    return ny


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--update-url', help='https-adresse til updates.json (legges i manifestet)')
    ap.add_argument('--mappe', help='lag også en utpakket kopi i denne mappa (tømmes først)')
    ap.add_argument('--chrome', action='store_true', help='lag Chrome-utgaven (…-chrome.zip) i stedet for Firefox')
    a = ap.parse_args()

    versjon, filer = innhold(a.update_url, a.chrome)
    ut = ROT / 'dist' / f'designupgrade-{versjon}{"-chrome" if a.chrome else ""}.zip'
    ut.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(ut, 'w', zipfile.ZIP_DEFLATED) as z:
        for navn, data in filer:
            z.writestr(navn, data)
    print(f'Laget {ut.relative_to(ROT)} ({ut.stat().st_size // 1024} kB), versjon {versjon}')

    if a.mappe:
        m = pathlib.Path(a.mappe).resolve()
        if m == ROT or ROT.is_relative_to(m):
            sys.exit('--mappe kan ikke være selve utvidelsesmappa')
        shutil.rmtree(m, ignore_errors=True)
        for navn, data in filer:
            (m / navn).parent.mkdir(parents=True, exist_ok=True)
            (m / navn).write_bytes(data)
        print(f'Laget utpakket kopi i {m}')


if __name__ == '__main__':
    main()
