// Trin 7: kobl den validerede Google Maps-integration fra trin 1 på den
// rigtige app (se test-maps/ for den oprindelige, telefon-testede version).
import { simplifyEvenlySpaced, buildGoogleMapsUrl } from "./simplify.js";

const MIN_KM = 1;
const MAX_KM = 42;
const MAPS_WAYPOINT_COUNT = 8; // valideret på telefon i trin 1

const GEO_ERROR_MESSAGES = {
  1: "Du har afvist adgang til din lokation. Tillad lokation i browserens indstillinger for at bruge appen.",
  2: "Kunne ikke finde din lokation lige nu. Prøv igen, evt. udenfor.",
  3: "Det tog for lang tid at finde din lokation. Prøv igen.",
};

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation er ikke understøttet i denne browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => reject(new Error(GEO_ERROR_MESSAGES[err.code] ?? `Kunne ikke hente lokation: ${err.message}`)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run-btn");
const kmInput = document.getElementById("km-input");
const mapsBtn = document.getElementById("maps-btn");

let mapsUrl = null;

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

function setBusy(busy, message) {
  runBtn.disabled = busy;
  kmInput.disabled = busy;
  if (busy) {
    mapsBtn.disabled = true;
    mapsUrl = null;
  }
  if (message) statusEl.textContent = message;
}

async function run() {
  const km = Number(kmInput.value);
  if (!Number.isFinite(km) || km < MIN_KM || km > MAX_KM) {
    statusEl.textContent = `Indtast et antal km mellem ${MIN_KM} og ${MAX_KM}.`;
    return;
  }

  setBusy(true, "Henter din lokation...");

  try {
    const coords = await getPosition();
    console.log("geolocation:", coords);

    setBusy(true, "Beregner rute...");
    const response = await fetch("/api/generate-route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude, km }),
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Uventet svar fra serveren. Prøv igen.");
    }
    console.log("generate-route response:", data);

    if (!response.ok) {
      throw new Error(data.error ?? `Serveren svarede med fejl ${response.status}`);
    }

    const actualKm = (data.distanceMeters / 1000).toFixed(2);
    const targetKm = (data.targetMeters / 1000).toFixed(2);
    const toleranceNote = data.withinTolerance
      ? ""
      : " (lidt uden for ±10% — ORS kunne ikke ramme præcis inden for vejnettet her)";
    setBusy(
      false,
      `Rute på ${actualKm} km (mål ${targetKm} km)${toleranceNote}.`
    );

    drawRoute(data.points);

    const waypoints = simplifyEvenlySpaced(data.points, MAPS_WAYPOINT_COUNT);
    mapsUrl = buildGoogleMapsUrl(waypoints, { travelmode: "walking" });
    mapsBtn.disabled = false;
  } catch (err) {
    console.error(err);
    setBusy(false, `Fejl: ${err.message}`);
  }
}

runBtn.addEventListener("click", run);
mapsBtn.addEventListener("click", () => {
  if (mapsUrl) window.location.href = mapsUrl;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("SW-registrering fejlede:", err));
  });
}
