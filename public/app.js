// Trin 7: kobl den validerede Google Maps-integration fra trin 1 på den
// rigtige app (se test-maps/ for den oprindelige, telefon-testede version).
import { simplifyEvenlySpaced, buildGoogleMapsUrl } from "./simplify.js";

const MIN_KM = 1;
const MAX_KM = 42;
const MAPS_WAYPOINT_COUNT = 8; // valideret på telefon i trin 1
const FAVORITES_KEY = "loeberute-favorites";
const FAVORITE_SLOTS = 3;

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

// --- Favoritter (localStorage, kun på denne enhed — intet login/backend) ---

function loadFavorites() {
  const slots = new Array(FAVORITE_SLOTS).fill(null);
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    for (let i = 0; i < FAVORITE_SLOTS; i++) slots[i] = parsed[i] ?? null;
  } catch (err) {
    console.error("Kunne ikke læse gemte favoritter:", err);
  }
  return slots;
}

function persistFavorites() {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  } catch (err) {
    console.error("Kunne ikke gemme favoritter:", err);
  }
}

let favorites = loadFavorites();

const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run-btn");
const kmInput = document.getElementById("km-input");
const mapsBtn = document.getElementById("maps-btn");
const saveRowEl = document.getElementById("save-row");
const favoritesListEl = document.getElementById("favorites-list");

let mapsUrl = null;
let currentRoute = null; // { points, distanceMeters, targetMeters }

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

function activateRoute(route) {
  currentRoute = route;
  drawRoute(route.points);

  const waypoints = simplifyEvenlySpaced(route.points, MAPS_WAYPOINT_COUNT);
  mapsUrl = buildGoogleMapsUrl(waypoints, { travelmode: "walking" });
  mapsBtn.disabled = false;
  saveRowEl.hidden = false;
}

function renderFavorites() {
  favoritesListEl.innerHTML = "";
  favorites.forEach((fav, i) => {
    const el = document.createElement("div");
    if (!fav) {
      el.className = "favorite-card empty";
      el.textContent = `Tom plads ${i + 1}`;
      favoritesListEl.appendChild(el);
      return;
    }

    el.className = "favorite-card";
    const km = (fav.distanceMeters / 1000).toFixed(2);
    const date = new Date(fav.savedAt).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

    const info = document.createElement("div");
    info.className = "favorite-info";
    info.innerHTML = `<strong>${km} km</strong><span>Gemt ${date}</span>`;

    const actions = document.createElement("div");
    actions.className = "favorite-actions";
    actions.innerHTML = `
      <button data-action="view" data-slot="${i}">Vis</button>
      <button data-action="maps" data-slot="${i}">Maps</button>
      <button data-action="delete" data-slot="${i}">Slet</button>
    `;

    el.append(info, actions);
    favoritesListEl.appendChild(el);
  });
}

favoritesListEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-action]");
  if (!btn) return;
  const slot = Number(btn.dataset.slot);
  const fav = favorites[slot];
  if (!fav) return;

  if (btn.dataset.action === "delete") {
    favorites[slot] = null;
    persistFavorites();
    renderFavorites();
  } else if (btn.dataset.action === "view") {
    activateRoute(fav);
    statusEl.textContent = `Viser favorit: ${(fav.distanceMeters / 1000).toFixed(2)} km.`;
  } else if (btn.dataset.action === "maps") {
    const waypoints = simplifyEvenlySpaced(fav.points, MAPS_WAYPOINT_COUNT);
    window.location.href = buildGoogleMapsUrl(waypoints, { travelmode: "walking" });
  }
});

saveRowEl.addEventListener("click", (event) => {
  const btn = event.target.closest("button[data-slot]");
  if (!btn || !currentRoute) return;
  const slot = Number(btn.dataset.slot);
  favorites[slot] = { ...currentRoute, savedAt: Date.now() };
  persistFavorites();
  renderFavorites();
  statusEl.textContent = `Rute gemt som favorit ${slot + 1}.`;
});

// --- Rute-generering ---

function setBusy(busy, message) {
  runBtn.disabled = busy;
  kmInput.disabled = busy;
  if (busy) {
    mapsBtn.disabled = true;
    saveRowEl.hidden = true;
    mapsUrl = null;
    currentRoute = null;
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
    setBusy(false, `Rute på ${actualKm} km (mål ${targetKm} km)${toleranceNote}.`);

    activateRoute({
      points: data.points,
      distanceMeters: data.distanceMeters,
      targetMeters: data.targetMeters,
    });
  } catch (err) {
    console.error(err);
    setBusy(false, `Fejl: ${err.message}`);
  }
}

runBtn.addEventListener("click", run);
mapsBtn.addEventListener("click", () => {
  if (mapsUrl) window.location.href = mapsUrl;
});

renderFavorites();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("SW-registrering fejlede:", err));
  });
}
