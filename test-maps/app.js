import { ROUTE_SAMPLE } from "./route-sample.js";
import {
  simplifyEvenlySpaced,
  totalDistanceMeters,
  buildGoogleMapsUrl,
} from "./simplify.js";

const els = {
  totalPoints: document.getElementById("total-points"),
  totalDistance: document.getElementById("total-distance"),
  waypointCount: document.getElementById("waypoint-count"),
  waypointCountLabel: document.getElementById("waypoint-count-label"),
  travelmode: document.getElementById("travelmode"),
  generateBtn: document.getElementById("generate-btn"),
  openBtn: document.getElementById("open-btn"),
  urlOutput: document.getElementById("url-output"),
  simplifiedCount: document.getElementById("simplified-count"),
  canvas: document.getElementById("route-canvas"),
};

let lastUrl = null;

function drawRoute(ctx, canvas, rawPoints, simplifiedPoints) {
  const lats = rawPoints.map((p) => p[0]);
  const lngs = rawPoints.map((p) => p[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const pad = 20;
  const w = canvas.width - pad * 2;
  const h = canvas.height - pad * 2;

  // Bevar aspect ratio nogenlunde rigtigt (grov korrektion for breddegrad).
  const latRange = maxLat - minLat || 1e-6;
  const lngRange = (maxLng - minLng) * Math.cos((minLat * Math.PI) / 180) || 1e-6;
  const scale = Math.min(w / lngRange, h / latRange);

  function project([lat, lng]) {
    const x = pad + ((lng - minLng) * Math.cos((minLat * Math.PI) / 180)) * scale;
    const y = pad + h - (lat - minLat) * scale;
    return [x, y];
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Rå spor (tynd grå linje)
  ctx.strokeStyle = "#999";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  rawPoints.forEach((p, i) => {
    const [x, y] = project(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Forenklet rute (rød, med punkter)
  ctx.strokeStyle = "#d33";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  simplifiedPoints.forEach((p, i) => {
    const [x, y] = project(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "#d33";
  simplifiedPoints.forEach((p, i) => {
    const [x, y] = project(p);
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.font = "11px sans-serif";
    ctx.fillText(String(i + 1), x + 6, y - 6);
    ctx.fillStyle = "#d33";
  });
}

function render() {
  const targetCount = Number(els.waypointCount.value);
  els.waypointCountLabel.textContent = targetCount;

  const simplified = simplifyEvenlySpaced(ROUTE_SAMPLE, targetCount);
  els.simplifiedCount.textContent = simplified.length;

  drawRoute(els.canvas.getContext("2d"), els.canvas, ROUTE_SAMPLE, simplified);

  return simplified;
}

function init() {
  els.totalPoints.textContent = ROUTE_SAMPLE.length;
  els.totalDistance.textContent = (totalDistanceMeters(ROUTE_SAMPLE) / 1000).toFixed(2);

  els.waypointCount.addEventListener("input", render);

  els.generateBtn.addEventListener("click", () => {
    const simplified = render();
    const travelmode = els.travelmode.value;
    lastUrl = buildGoogleMapsUrl(simplified, { travelmode });
    els.urlOutput.textContent = lastUrl;
    els.urlOutput.href = lastUrl;
    els.openBtn.disabled = false;
  });

  els.openBtn.addEventListener("click", () => {
    if (lastUrl) window.location.href = lastUrl;
  });

  render();
}

init();
