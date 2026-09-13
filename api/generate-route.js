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

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function haversineMeters([lat1, lng1], [lat2, lng2]) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg([lat1, lng1], [lat2, lng2]) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const MIN_SEGMENT_METERS = 15; // ignorér GPS/polyline-støj på meget korte stræk
const HAIRPIN_ANGLE_DEG = 150; // ægte U-vending — næsten altid en blindgyde-spur
const TURN_ANGLE_DEG = 30; // tærskel for overhovedet at tælle noget som "et sving"
const MIN_TURN_SPACING_METERS = 40; // to sving tættere end dette ligner en cramped zigzag/spur

// Analyserer rutens "sleekness": tæller sving, ægte hårnålevendinger (≥150°),
// og hvor mange sving-par der ligger mistænkeligt tæt på hinanden (typisk tegn
// på at ruten snor sig frem og tilbage for at ramme distancen, i stedet for at
// følge en naturlig sti). Alt normaliseres ikke eksplicit efter rutelængde her
// — det sker i badnessScore, så korte og lange ruter kan sammenlignes fair.
function analyzeRoute(points, distanceMeters) {
  const turns = [];
  let cumulative = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const segA = haversineMeters(points[i - 1], points[i]);
    cumulative += segA;
    const segB = haversineMeters(points[i], points[i + 1]);
    if (segA < MIN_SEGMENT_METERS || segB < MIN_SEGMENT_METERS) continue;

    const bearingA = bearingDeg(points[i - 1], points[i]);
    const bearingB = bearingDeg(points[i], points[i + 1]);
    let diff = Math.abs(bearingA - bearingB);
    if (diff > 180) diff = 360 - diff;

    if (diff >= TURN_ANGLE_DEG) {
      turns.push({ angle: diff, cumulative });
    }
  }

  const hairpins = turns.filter((t) => t.angle >= HAIRPIN_ANGLE_DEG).length;

  let closeTurnPairs = 0;
  for (let i = 1; i < turns.length; i++) {
    if (turns[i].cumulative - turns[i - 1].cumulative < MIN_TURN_SPACING_METERS) {
      closeTurnPairs++;
    }
  }

  const turnsPerKm = turns.length / (distanceMeters / 1000);

  return { hairpins, closeTurnPairs, turnsPerKm };
}

// Én samlet "grimhed"-score til at sammenligne forsøg. Ægte hårnåler vejer
// suverænt tungest, cramped sving-par næsttungest, og generel sving-tæthed
// (pr. km, så ruter af forskellig længde kan sammenlignes fair) er en mild
// tiebreaker for ellers lige gode ruter.
function badnessScore({ hairpins, closeTurnPairs, turnsPerKm }) {
  return hairpins * 1000 + closeTurnPairs * 100 + turnsPerKm;
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
  // Længden vi rent faktisk beder ORS om. Justeres mellem forsøg baseret på
  // hvor meget forrige forsøg var ved siden af – hvis ORS konsekvent leverer
  // for lange/korte ruter i området, hjælper det mere end blot at skifte seed.
  let requestLength = targetMeters;

  // Blandt alle forsøg foretrækker vi den "pæneste" rute (lavest badnessScore),
  // ikke bare den der matcher distancen bedst.
  let best = null;

  // Rangordning for fallback-valget: en rute inden for ±10% vinder altid over
  // en der ikke er, uanset badnessScore. Kun blandt ligeværdige (samme
  // tolerance-status) afgør badnessScore, og til sidst distance-nøjagtighed.
  function isBetter(candidate, current) {
    if (!current) return true;
    if (candidate.inTolerance !== current.inTolerance) return candidate.inTolerance;
    if (candidate.badness !== current.badness) return candidate.badness < current.badness;
    return candidate.distErr < current.distErr;
  }

  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const seed = Math.floor(Math.random() * 1_000_000);
      const result = await requestRoundTrip(apiKey, lat, lng, requestLength, seed);

      const analysis = analyzeRoute(result.points, result.distanceMeters);
      const candidate = {
        ...result,
        ...analysis,
        badness: badnessScore(analysis),
        distErr: Math.abs(result.distanceMeters - targetMeters),
        inTolerance: withinTolerance(result.distanceMeters, targetMeters),
      };

      if (isBetter(candidate, best)) {
        best = candidate;
      }

      if (candidate.inTolerance && candidate.hairpins === 0 && candidate.closeTurnPairs === 0) {
        res.status(200).json({
          points: candidate.points,
          distanceMeters: candidate.distanceMeters,
          targetMeters,
          withinTolerance: true,
          attempts: attempt,
        });
        return;
      }

      // Proportional korrektion: bad vi om for lidt/for meget forhold til det
      // vi fik, så ret op på det til næste forsøg, med grænser for at undgå
      // at sende absurde værdier til ORS.
      const ratio = targetMeters / result.distanceMeters;
      requestLength = Math.min(Math.max(requestLength * ratio, targetMeters * 0.3), targetMeters * 3);
    }

    // Ingen forsøg var både inden for tolerancen og fri af hårnålevendinger —
    // returnér det bedst scorede forsøg, blot markeret hvis det er uden for ±10%.
    res.status(200).json({
      points: best.points,
      distanceMeters: best.distanceMeters,
      targetMeters,
      withinTolerance: best.inTolerance,
      attempts: MAX_ATTEMPTS,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
