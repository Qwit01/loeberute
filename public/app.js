// Trin 3: minimal frontend-test af backend-pipelinen.
// Hardcodede test-værdier (Aalborg centrum) — geolocation kommer i trin 5.
const HARDCODED_INPUT = { lat: 57.0488, lng: 9.9217, km: 5 };

const statusEl = document.getElementById("status");
const runBtn = document.getElementById("run-btn");

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
      `inden for ±10%: ${data.withinTolerance}, ${data.attempts} forsøg). ` +
      `Se konsollen for de fulde koordinater.`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Fejl: ${err.message}`;
  } finally {
    runBtn.disabled = false;
  }
}

runBtn.addEventListener("click", run);
