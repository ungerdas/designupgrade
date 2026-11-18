# Designupgrade

Små designjusteringer i Firefox. Torrentsiden får plakat, handling og sjangre fra TMDB (står det en TMDB-lenke i beskrivelsen, brukes den, og enkeltepisoder får også episodens tittel, sendedato og handling), og torrentlistene får kortvisning med plakater og flagg for lyd og nordiske undertekster. Musikk får cover, sporliste og sjangre fra Deezer eller MusicBrainz, og lydbøker får omslag, omtale og oppleser fra Nasjonalbiblioteket. Spill får cover, omtale, stikkord og utgiver fra Steam-butikken (står det en Steam-lenke i beskrivelsen, brukes den). Topp 10 og alternativene på torrentsiden får samme kortvisning, og hele siden kan få mørk modus (basert på tavi206 sitt tema). På telefon (f.eks. Orion på iPhone) får siden en egen mobilvisning med menyen bak en knapp. Svarer serveren med en feil (500, 502, 503 …), vises en ryddig feilside. På sider som bare viser noe, prøver den igjen av seg selv, og feiler en knapp, kan du gå rett tilbake. Alt kan skrus av med ett klikk.

I søkefeltet for torrents kan du søke med TMDB-id: skriv `tmdb:603`, `tmdb:tv:243518` eller lim inn en lenke fra themoviedb.org. Id-en gjøres om til IMDb-id, og siden søkes med den. Er id-en både en film og en serie, velger du. I det avanserte søket er «IMDb Rating» byttet ut med et TMDB-felt. En IMDb-id eller IMDb-lenke i søkefeltet går rett til IMDb-søket.

## Installere

1. Last ned `designupgrade-….xpi` fra [siste utgivelse](https://github.com/ungerdas/designupgrade/releases/latest) og dra fila inn i Firefox (142 eller nyere, PC).
2. Hent en gratis API-nøkkel på [themoviedb.org](https://www.themoviedb.org/settings/api), klikk på D+-ikonet og lim den inn.

Fra og med versjon 3.11.0 oppdaterer Firefox utvidelsen av seg selv når det kommer en ny versjon (Firefox sjekker én gang i døgnet).

## Personvern

Tittel, år, IMDb-id og TMDB-id sendes til The Movie Database for å finne riktig plakat og handling, og for å gjøre en TMDB-id om til IMDb-id når du søker. For musikk sendes artist og albumtittel til Deezer, og til MusicBrainz når Deezer ikke har albumet. For lydbøker sendes forfatter og tittel til Nasjonalbiblioteket, og for spill sendes tittelen fra releasenavnet (eller Steam-id-en fra en Steam-lenke i beskrivelsen) til Steam-butikken. Ingenting sendes til utvikleren, og det er ingen sporing.

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
