// Rene, afhængighedsfrie funktioner til at forenkle en GPS-rute til et
// håndfuldt waypoints og bygge en Google Maps-navigations-URL ud fra dem.
// Ingen browser- eller frameworkafhængigheder, så de kan genbruges uændret
// senere i den rigtige app (jf. plan trin 7).

const EARTH_RADIUS_M = 6371000;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineMeters([lat1, lng1], [lat2, lng2]) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function totalDistanceMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/**
 * Reducerer en tæt punktliste til `targetCount` punkter, jævnt fordelt efter
 * kørt afstand (ikke efter indeks) — så punkterne er repræsentative uanset om
 * GPS-optagelsen har ujævn punkttæthed (fx pauser, langsomme sving).
 * Første og sidste punkt bevares altid.
 */
export function simplifyEvenlySpaced(points, targetCount) {
  if (targetCount < 2) {
    throw new Error("targetCount skal være mindst 2 (start + slut)");
  }
  if (points.length <= targetCount) {
    return points.slice();
  }

  const total = totalDistanceMeters(points);
  const step = total / (targetCount - 1);

  const result = [points[0]];
  let accumulated = 0;
  let nextTarget = step;

  for (let i = 1; i < points.length - 1 && result.length < targetCount - 1; i++) {
    accumulated += haversineMeters(points[i - 1], points[i]);
    if (accumulated >= nextTarget) {
      result.push(points[i]);
      nextTarget += step;
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

/**
 * Bygger en Google Maps "dir" URL efter det gratis api=1-skema:
 * https://developers.google.com/maps/documentation/urls/get-started#directions-action
 * waypoints er en liste af [lat, lng] punkter, hvor det første er origin og
 * det sidste er destination (for en loop-rute er de identiske).
 */
export function buildGoogleMapsUrl(waypoints, { travelmode = "walking" } = {}) {
  if (waypoints.length < 2) {
    throw new Error("Der skal være mindst origin og destination");
  }

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const middle = waypoints.slice(1, -1);

  const params = new URLSearchParams({
    api: "1",
    origin: `${origin[0]},${origin[1]}`,
    destination: `${destination[0]},${destination[1]}`,
    travelmode,
  });

  if (middle.length > 0) {
    params.set("waypoints", middle.map(([lat, lng]) => `${lat},${lng}`).join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
