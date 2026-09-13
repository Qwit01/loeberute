// Trin 3: minimal frontend-test af backend-pipelinen.
// Hardcodede test-værdier (Aalborg centrum) — geolocation kommer i trin 5.
const HARDCODED_INPUT = { lat: 57.0488, lng: 9.9217, km: 5 };

const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run-btn");

let map;
let routeLayer;
let startMarker;

function ensureMap() {
  if (map) return map;
  map = L.map("map");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
  return map;
}

function drawRoute(points) {
  const m = ensureMap();
  if (routeLayer) routeLayer.remove();
  if (startMarker) startMarker.remove();

  routeLayer = L.polyline(points, { color: "#d33", weight: 4 }).addTo(m);
  startMarker = L.marker(points[0]).addTo(m).bindPopup("Start/slut");
  m.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
}

async function run() {
  statusEl.textContent = "Henter rute fra /api/generate-route...";
  runBtn.disabled = true;

  try {
    const response = await fetch("/api/generate-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(HARDCODED_INPUT),
    });
    const data = await response.json();
    console.log("generate-route response:", data);

    if (!response.ok) {
      statusEl.textContent = `Fejl (${response.status}): ${data.error}`;
      return;
    }

    const km = (data.distanceMeters / 1000).toFixed(2);
    const targetKm = (data.targetMeters / 1000).toFixed(2);
    statusEl.textContent =
      `OK: ${data.points.length} punkter, ${km} km (mål ${targetKm} km, ` +
      `inden for ±10%: ${data.withinTolerance}, ${data.attempts} forsøg).`;

    drawRoute(data.points);
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Fejl: ${err.message}`;
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", run);
