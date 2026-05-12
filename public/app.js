// Street Tree Explorer — front-end app
// Loads Portland Street Tree Inventory from the City's ArcGIS FeatureServer,
// renders on a MapLibre map, and routes chat questions to a Worker that
// returns a structured filter the browser applies locally.

// ── Config ────────────────────────────────────────────────────────────
const FEATURE_SERVER =
  "https://www.portlandmaps.com/arcgis/rest/services/Public/Parks_UF_Tree_Layers/MapServer/12";

// Deployed Worker URL — handles AI chat requests.
const CHAT_API = "https://street-tree-chat.killtimber1.workers.dev";

// MaxRecordCount on Portland's MapServer is 2000.
const PAGE_SIZE = 2000;
const TARGET_TOTAL = 20000;

// ── Auth ─────────────────────────────────────────────────────────────
const AUTH_KEY = "stx_pw";
let appPassword = localStorage.getItem(AUTH_KEY) || "";

function injectAuthOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-mark"></div>
      <h1>Street Tree Explorer</h1>
      <p>Private preview. Enter password to continue.</p>
      <form id="auth-form">
        <input type="password" id="auth-input" placeholder="Password" autocomplete="off" />
        <button type="submit">Enter</button>
      </form>
      <div id="auth-error"></div>
    </div>`;
  document.body.appendChild(overlay);

  const style = document.createElement("style");
  style.textContent = `
    #auth-overlay { position: fixed; inset: 0; z-index: 1000; background: var(--bg); display: grid; place-items: center; }
    #auth-overlay.hidden { opacity: 0; visibility: hidden; transition: opacity 0.3s, visibility 0.3s; }
    .auth-card { background: var(--surface-strong); backdrop-filter: blur(24px) saturate(140%); border: 1px solid var(--border); padding: 40px; border-radius: 20px; box-shadow: var(--shadow); max-width: 360px; width: 90%; text-align: center; }
    .auth-mark { width: 48px; height: 48px; margin: 0 auto 20px; border-radius: 14px; background: radial-gradient(circle at 30% 30%, var(--moss) 0%, var(--moss-deep) 70%); }
    .auth-card h1 { font-size: 18px; margin: 0 0 6px; font-weight: 600; }
    .auth-card p { color: var(--text-faint); font-size: 13px; margin: 0 0 24px; }
    #auth-form { display: flex; gap: 8px; }
    #auth-input { flex: 1; background: var(--bg-elev); border: 1px solid var(--border-strong); border-radius: 10px; padding: 12px 14px; color: var(--text); font: inherit; font-size: 14px; outline: none; }
    #auth-input:focus { border-color: var(--moss); }
    #auth-form button { padding: 12px 20px; border: none; border-radius: 10px; background: var(--moss); color: var(--bg); font: inherit; font-weight: 600; cursor: pointer; }
    #auth-form button:hover { background: #6dc193; }
    #auth-error { color: var(--rust); font-size: 12px; margin-top: 12px; min-height: 16px; }
  `;
  document.head.appendChild(style);
}

async function verifyPassword(pw) {
  try {
    const res = await fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Password": pw },
      body: JSON.stringify({ question: "" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureAuth() {
  if (appPassword) {
    const ok = await verifyPassword(appPassword);
    if (ok) return;
    localStorage.removeItem(AUTH_KEY);
    appPassword = "";
  }
  injectAuthOverlay();
  const form = document.getElementById("auth-form");
  const input = document.getElementById("auth-input");
  const err = document.getElementById("auth-error");
  input.focus();
  return new Promise((resolve) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = input.value.trim();
      if (!pw) return;
      err.textContent = "";
      input.disabled = true;
      const ok = await verifyPassword(pw);
      input.disabled = false;
      if (!ok) {
        err.textContent = "Incorrect password.";
        input.select();
        return;
      }
      appPassword = pw;
      localStorage.setItem(AUTH_KEY, pw);
      document.getElementById("auth-overlay").classList.add("hidden");
      setTimeout(() => document.getElementById("auth-overlay").remove(), 300);
      resolve();
    });
  });
}

// ── Map ──────────────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      carto: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
        attribution:
          "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> · © CARTO · Trees: City of Portland",
      },
      labels: {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png",
        ],
        tileSize: 256,
      },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0d1410" } },
      { id: "carto", type: "raster", source: "carto" },
      { id: "labels", type: "raster", source: "labels" },
    ],
  },
  center: [-122.6765, 45.5231],
  zoom: 11.5,
  pitch: 0,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");

// ── Data ─────────────────────────────────────────────────────────────
let allFeatures = [];
let filteredIds = null;

async function loadTrees() {
  const all = [];
  let offset = 0;

  while (offset < TARGET_TOTAL) {
    const params = {
      where: "1=1",
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      f: "geojson",
      resultRecordCount: PAGE_SIZE,
      resultOffset: offset,
    };
    let url = `${FEATURE_SERVER}/query?` + new URLSearchParams(params);
    let res = await fetch(url);

    if (!res.ok) {
      params.f = "json";
      url = `${FEATURE_SERVER}/query?` + new URLSearchParams(params);
      res = await fetch(url);
      if (!res.ok) throw new Error(`Feature service: ${res.status}`);
      const data = await res.json();
      const feats = (data.features || []).map(esriToGeoJSON);
      if (!feats.length) break;
      all.push(...feats);
      if (feats.length < PAGE_SIZE) break;
    } else {
      const fc = await res.json();
      const feats = fc.features || [];
      if (!feats.length) break;
      all.push(...feats);
      if (feats.length < PAGE_SIZE) break;
    }

    offset += PAGE_SIZE;
  }
  return all;
}

function esriToGeoJSON(f) {
  return {
    type: "Feature",
    geometry: f.geometry
      ? { type: "Point", coordinates: [f.geometry.x, f.geometry.y] }
      : null,
    properties: f.attributes || {},
  };
}

function addLayers(features) {
  map.addSource("trees", {
    type: "geojson",
    data: { type: "FeatureCollection", features },
  });

  map.addLayer({
    id: "trees-glow",
    type: "circle",
    source: "trees",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 13, 3, 16, 8, 19, 18],
      "circle-color": [
        "match",
        ["coalesce", ["get", "Condition"], "Unknown"],
        "Good", "#5fb585",
        "Fair", "#e8c468",
        "Poor", "#d97757",
        "Dead", "#8b3a2a",
        "#6b756f",
      ],
      "circle-opacity": 0.85,
      "circle-blur": 0.15,
      "circle-stroke-width": 0,
    },
  });

  map.on("click", "trees-glow", (e) => {
    const f = e.features[0];
    const p = f.properties;
    const html = `
      <div style="font: 13px/1.5 Inter, sans-serif; color: #ecf0ec; min-width: 180px;">
        <div style="font-weight: 600; margin-bottom: 4px;">${p.Common || p.Species || "Tree"}</div>
        <div style="color: #a0aaa3; font-size: 11px; margin-bottom: 6px;">${p.Genus || ""} ${p.Species || ""}</div>
        <div><b>DBH:</b> ${p.DBH || "—"}″</div>
        <div><b>Condition:</b> ${p.Condition || "—"}</div>
        <div><b>Address:</b> ${p.Address || "—"}</div>
      </div>`;
    new maplibregl.Popup({ closeButton: false, className: "tree-popup" })
      .setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  map.on("mouseenter", "trees-glow", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "trees-glow", () => (map.getCanvas().style.cursor = ""));
}

function applyFilter(filterFn) {
  const features = filterFn ? allFeatures.filter(filterFn) : allFeatures;
  filteredIds = filterFn ? new Set(features.map((f) => f.properties.OBJECTID)) : null;
  map.getSource("trees").setData({ type: "FeatureCollection", features });
  updateStats(features);
  if (filterFn && features.length > 0) {
    const bounds = new maplibregl.LngLatBounds();
    features.forEach((f) => bounds.extend(f.geometry.coordinates));
    map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 800 });
  }
}

function updateStats(features) {
  document.getElementById("visible-count").textContent = features.length.toLocaleString();
  const species = new Set(features.map((f) => f.properties.Species).filter(Boolean));
  document.getElementById("species-count").textContent = species.size.toLocaleString();
}

// ── Chat ─────────────────────────────────────────────────────────────
const composer = document.getElementById("composer");
const promptInput = document.getElementById("prompt");
const messages = document.getElementById("messages");

function addMessage(role, text, opts = {}) {
  const div = document.createElement("div");
  div.className = `msg ${role}` + (opts.thinking ? " thinking" : "");
  div.innerHTML = `<div class="bubble"></div>`;
  div.querySelector(".bubble").textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

composer.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = promptInput.value.trim();
  if (!q) return;
  promptInput.value = "";
  addMessage("user", q);
  const thinking = addMessage("assistant", "thinking…", { thinking: true });

  try {
    const res = await fetch(CHAT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Password": appPassword },
      body: JSON.stringify({ question: q }),
    });

    if (res.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      location.reload();
      return;
    }
    if (!res.ok) throw new Error(`Chat API: ${res.status}`);
    const data = await res.json();

    thinking.remove();
    if (data.filter) applyFilter(buildFilterFn(data.filter));
    addMessage("assistant", data.summary || "Done — map updated.");
  } catch (err) {
    thinking.remove();
    const localFilter = localFallback(q);
    if (localFilter) {
      applyFilter(localFilter.fn);
      addMessage("assistant", `(offline mode) Filtered to ${localFilter.label}.`);
    } else {
      addMessage("assistant", "Couldn't reach the AI. Try a keyword like 'maple' or 'poor condition' for a local match.");
    }
  }
});

function buildFilterFn(filter) {
  return (f) => {
    const p = f.properties;
    if (filter.genus && !ciEq(p.Genus, filter.genus)) return false;
    if (filter.species && !ciEq(p.Species, filter.species)) return false;
    if (filter.common && !ciIncludes(p.Common, filter.common)) return false;
    if (filter.condition && !ciEq(p.Condition, filter.condition)) return false;
    if (filter.dbh_min != null && (p.DBH ?? 0) < filter.dbh_min) return false;
    if (filter.dbh_max != null && (p.DBH ?? 999) > filter.dbh_max) return false;
    return true;
  };
}

const ciEq = (a, b) => String(a || "").toLowerCase().trim() === String(b || "").toLowerCase().trim();
const ciIncludes = (a, b) => String(a || "").toLowerCase().includes(String(b || "").toLowerCase());

function localFallback(q) {
  const lower = q.toLowerCase();
  const conditions = ["good", "fair", "poor", "dead"];
  for (const c of conditions) {
    if (lower.includes(c + " condition") || lower.includes("in " + c)) {
      return { label: `${c} condition`, fn: (f) => ciEq(f.properties.Condition, c[0].toUpperCase() + c.slice(1)) };
    }
  }
  const m = lower.match(/\b(maple|oak|cherry|plum|magnolia|pine|fir|elm|ash|cedar|dogwood|linden|birch)s?\b/);
  if (m) return { label: `${m[1]}s`, fn: (f) => ciIncludes(f.properties.Common, m[1]) };
  return null;
}

// ── Boot ─────────────────────────────────────────────────────────────
map.on("load", async () => {
  await ensureAuth();
  try {
    allFeatures = await loadTrees();
    addLayers(allFeatures);
    updateStats(allFeatures);
    document.getElementById("loader").classList.add("hidden");
  } catch (err) {
    console.error(err);
    document.getElementById("loader").innerHTML =
      `<div class="loader-inner"><span style="color:#d97757">Couldn't load tree data.<br>${err.message}</span></div>`;
  }
});
