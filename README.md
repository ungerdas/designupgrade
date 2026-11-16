# Designupgrade

Små designjusteringer i Firefox. Torrentsiden får plakat, handling og sjangre fra TMDB, og torrentlistene får kortvisning med plakater og flagg for lyd og nordiske undertekster. Musikk får cover, sporliste og sjangre fra Deezer eller MusicBrainz, og lydbøker får omslag, omtale og oppleser fra Nasjonalbiblioteket. Topp 10 og alternativene på torrentsiden får samme kortvisning, og hele siden kan få mørk modus (basert på tavi206 sitt tema). På telefon (f.eks. Orion på iPhone) får siden en egen mobilvisning med menyen bak en knapp. Alt kan skrus av med ett klikk.

## Installere

1. Last ned `designupgrade-….xpi` fra [siste utgivelse](https://github.com/ungerdas/designupgrade/releases/latest) og dra fila inn i Firefox (142 eller nyere, PC).
2. Hent en gratis API-nøkkel på [themoviedb.org](https://www.themoviedb.org/settings/api), klikk på D+-ikonet og lim den inn.

Utvidelsen kommer også på Firefox Add-ons, og da oppdateres den automatisk.

## Personvern

Tittel, år og IMDb-id sendes til The Movie Database for å finne riktig plakat og handling. For musikk sendes artist og albumtittel til Deezer, og til MusicBrainz når Deezer ikke har albumet. For lydbøker sendes forfatter og tittel til Nasjonalbiblioteket. Begge deler kan skrus av i popupen. Ingenting sendes til utvikleren, og det er ingen sporing.

---

This product uses the TMDB API but is not endorsed or certified by TMDB.
