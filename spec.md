# Løberute-generator – teknisk oplæg

## Formål

En mobilvenlig hjemmeside hvor man indtaster en ønsket distance (km), får beregnet en løberute af nogenlunde den længde ud fra sin nuværende lokation, og kan sende ruten videre til Google Maps for tur-for-tur-navigation med stemmestyring.

## Kernefunktionalitet (MVP)

1. Brugeren åbner siden på telefonen og indtaster ønsket distance i km.
2. Siden henter brugerens lokation via browserens geolocation-API.
3. En backend-funktion beregner en rundtur (loop, start = slut) der matcher distancen inden for ca. ±10%.
4. Ruten vises på et kort i appen, så brugeren kan tjekke den giver mening.
5. Brugeren trykker "Åbn i Google Maps", som starter tur-for-tur-navigation med stemmestyring i Maps-appen.

## Trufne designvalg

- Ruten er altid et loop der starter og slutter samme sted.
- Fokus er lokalt (Aalborg/Danmark) – ingen krav om global dækning.
- Ingen styring af underlag/vejtype i MVP'en (ingen valg mellem fortov/sti/natur).
- Anonymt engangsværktøj – ingen login, ingen gemt historik.
- Rutegenereringen bruger en ekstern gratis routing-service (openrouteservice) frem for en selv-hostet routing-motor.
- Tolerance på afstanden er ±10% af det ønskede antal km.

## Arkitektur

**Frontend**
Mobilvenlig single-page app, gerne som installérbar PWA (manifest + evt. service worker). Indeholder:
- Inputfelt til km + knap til at beregne rute
- Kald til `navigator.geolocation.getCurrentPosition` for lokation
- Kort-visning af den beregnede rute (Leaflet + OpenStreetMap-tiles, gratis)
- Knap der åbner ruten i Google Maps

**Backend**
En lille serverless-funktion (Vercel eller Netlify, begge har gratis lag), der:
- Modtager lat/lng + ønsket distance fra frontend
- Kalder openrouteservice Directions API med `options.round_trip` (længde i meter, seed, evt. flere forsøg med nyt seed hvis resultatet ligger uden for ±10%)
- Returnerer rutens koordinater til frontend
- Holder ORS-API-nøglen skjult (må aldrig ligge i frontend-koden)

**Hosting**
Frontend + backend-funktion samlet på Vercel/Netlify. Giver automatisk HTTPS (påkrævet for geolocation) og gør siden tilgængelig fra mobildata, hvilket er nødvendigt da appen bruges ude på løberuten og ikke på hjemme-wifi.

## Nøglerisiko: Google Maps' waypoint-grænse

Dette er det mest usikre led i hele kæden og bør bygges og testes først, før tid lægges i resten af UI'en.

ORS returnerer en rute som en lang stribe GPS-punkter (ofte 100+). Google Maps' gratis URL-skema til at åbne en rute med undervejspunkter (`google.com/maps/dir/?api=1&...`) har en praktisk grænse på omkring 9-10 punkter. Der skal derfor bygges en forenklingsfunktion (fx udvælgelse med jævne mellemrum, eller en algoritme som Douglas-Peucker) der reducerer ruten til et håndfuldt repræsentative punkter.

Vigtigt: Google Maps beregner selv den hurtigste vej mellem hvert par af punkter, så den følger ikke nødvendigvis den præcise sti ORS fandt frem til – især ikke hvis punkterne ligger langt fra hinanden. I praksis går det som regel fint for byruter, men det bør afprøves på egen telefon tidligt i forløbet.

## Foreslået tech stack

- **Frontend:** HTML/CSS/vanilla JS (eller et let framework), PWA-manifest
- **Kortvisning:** Leaflet + OpenStreetMap-tiles
- **Backend:** Node.js serverless-funktion (Vercel/Netlify)
- **Rutegenerering:** openrouteservice Directions API, `round_trip`-funktionen
- **Ruteforenkling:** Douglas-Peucker eller simpel afstands-baseret udvælgelse til ca. 8 waypoints

## Opsætning

- Opret en gratis konto på openrouteservice.org og hent en API-nøgle
- Gem nøglen som miljøvariabel i hosting-platformen, aldrig direkte i kode

## Åbne spørgsmål / næste skridt

- Byg og test Google Maps-integrationen (waypoint-forenkling + faktisk navigation på telefonen) allerførst
- Afgør retry-/justeringslogik i backend for at ramme ±10%-tolerancen konsekvent
- Fremtidig mulighed: udskifte openrouteservice med en selv-hostet GraphHopper/OSRM-instans (fx på et home server) uden at ændre frontend, hvis det bliver interessant senere
