// Vercel serverless function (Node runtime).
// POST { lat, lng, km } -> { points: [[lat,lng], ...], distanceMeters, targetMeters, withinTolerance, attempts }
//
// Kalder openrouteservice's round_trip-funktion og forsøger med nyt seed op
// til MAX_ATTEMPTS gange hvis resultatet ligger uden for ±10% af ønsket distance.
// ORS-nøglen læses fra miljøvariablen ORS_API_KEY og sendes ALDRIG til klienten.

const ORS_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson";
const TOLERANCE = 0.1; // ±10%, jf. spec.md
const MAX_ATTEMPTS = 5;
const MIN_KM = 1;
const MAX_KM = 42; // ORS' round_trip har i praksis et loft omkring 100 km, men appen er en løbe-app

function withinTolerance(actualMeters, targetMeters) {
  return Math.abs(actualMeters - targetMeters) <= targetMeters * TOLERANCE;
}

async function requestRoundTrip(apiKey, lat, lng, targetMeters, seed) {
  const response = await fetch(ORS_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [[lng, lat]],
      options: {
        round_trip: {
          length: targetMeters,
          points: 5,
          seed,
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ORS svarede ${response.status}: ${text}`);
  }

  const geojson = await response.json();
  const feature = geojson.features?.[0];
  if (!feature) {
    throw new Error("ORS-svar indeholdt ingen rute");
  }

  const distanceMeters = feature.properties?.summary?.distance;
  // GeoJSON-koordinater er [lng, lat] – vend dem til [lat, lng] for resten af appen.
  const points = feature.geometry.coordinates.map(([lo, la]) => [la, lo]);

  return { points, distanceMeters };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Kun POST er tilladt" });
    return;
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ORS_API_KEY er ikke sat på serveren" });
    return;
  }

  const { lat, lng, km } = req.body ?? {};
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    typeof km !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    !Number.isFinite(km) ||
    km < MIN_KM ||
    km > MAX_KM
  ) {
    res.status(400).json({
      error: `lat, lng skal være tal, og km skal være et tal mellem ${MIN_KM} og ${MAX_KM}`,
    });
    return;
  }

  const targetMeters = km * 1000;
  let best = null;

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const seed = Math.floor(Math.random() * 1_000_000);
      const result = await requestRoundTrip(apiKey, lat, lng, targetMeters, seed);

      if (!best || Math.abs(result.distanceMeters - targetMeters) < Math.abs(best.distanceMeters - targetMeters)) {
        best = result;
      }

      if (withinTolerance(result.distanceMeters, targetMeters)) {
        res.status(200).json({
          points: result.points,
          distanceMeters: result.distanceMeters,
          targetMeters,
          withinTolerance: true,
          attempts: attempt,
        });
        return;
      }
    }

    // Ingen forsøg landede inden for tolerancen — returnér det bedste vi fandt,
    // så brugeren i det mindste får en rute, blot markeret som uden for ±10%.
    res.status(200).json({
      points: best.points,
      distanceMeters: best.distanceMeters,
      targetMeters,
      withinTolerance: false,
      attempts: MAX_ATTEMPTS,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
