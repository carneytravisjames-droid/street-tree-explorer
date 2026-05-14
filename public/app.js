// Street Tree Explorer — front-end app

// ── Config ────────────────────────────────────────────────────────────
const FEATURE_SERVER =
  "https://www.portlandmaps.com/arcgis/rest/services/Public/Parks_UF_Tree_Layers/MapServer/12";

const CHAT_API = "https://street-tree-chat.killtimber1.workers.dev";

const PAGE_SIZE = 2000;
const CONCURRENCY = 15;
const HARD_CAP = 1000000; // safety ceiling — Portland has nowhere near this many

// ── Auth ─────────────────────────────────────────────────────────────
const AUTH_KEY = "stx_pw";
let appPassword = localStorage.getItem(AUTH_KEY) || "";

function injectAuthOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  overlay.innerHTML = `
    <svg class="forest-scene" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#070d0a"/>
          <stop offset="55%" stop-color="#0c1612"/>
          <stop offset="100%" stop-color="#1a2520"/>
        </linearGradient>
        <linearGradient id="fog" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(40,60,50,0)"/>
          <stop offset="100%" stop-color="rgba(8,14,11,0.95)"/>
        </linearGradient>
        <radialGradient id="moon" cx="80%" cy="20%" r="35%">
          <stop offset="0%" stop-color="rgba(180,200,180,0.18)"/>
          <stop offset="100%" stop-color="rgba(180,200,180,0)"/>
        </radialGradient>
        <symbol id="tree" viewBox="-50 -150 100 200">
          <path d="M0,-140 L-13,-95 L-6,-95 L-22,-60 L-10,-60 L-30,-25 L-15,-25 L-38,15 L-45,30 L45,30 L38,15 L15,-25 L30,-25 L10,-60 L22,-60 L6,-95 L13,-95 Z" fill="currentColor"/>
          <rect x="-3" y="25" width="6" height="12" fill="currentColor"/>
        </symbol>
      </defs>

      <rect width="1200" height="600" fill="url(#sky)"/>
      <rect width="1200" height="600" fill="url(#moon)"/>

      <g class="layer-far" color="#1f3328">
        <use href="#tree" x="50" y="440" width="80" height="160"/>
        <use href="#tree" x="160" y="455" width="65" height="130"/>
        <use href="#tree" x="260" y="445" width="75" height="150"/>
        <use href="#tree" x="370" y="450" width="70" height="140"/>
        <use href="#tree" x="480" y="440" width="80" height="160"/>
        <use href="#tree" x="600" y="455" width="65" height="130"/>
        <use href="#tree" x="710" y="445" width="75" height="150"/>
        <use href="#tree" x="830" y="450" width="70" height="140"/>
        <use href="#tree" x="950" y="440" width="80" height="160"/>
        <use href="#tree" x="1080" y="455" width="65" height="130"/>
      </g>

      <g class="layer-mid" color="#11201a">
        <use href="#tree" x="-20" y="380" width="130" height="260"/>
        <use href="#tree" x="130" y="400" width="105" height="210"/>
        <use href="#tree" x="280" y="385" width="125" height="250"/>
        <use href="#tree" x="440" y="395" width="115" height="230"/>
        <use href="#tree" x="600" y="380" width="135" height="270"/>
        <use href="#tree" x="780" y="395" width="115" height="230"/>
        <use href="#tree" x="930" y="385" width="125" height="250"/>
        <use href="#tree" x="1100" y="400" width="105" height="210"/>
      </g>

      <g class="layer-near" color="#050a07">
        <use href="#tree" x="-110" y="270" width="230" height="460"/>
        <use href="#tree" x="130" y="330" width="170" height="340"/>
        <use href="#tree" x="350" y="290" width="210" height="420"/>
        <use href="#tree" x="610" y="310" width="190" height="380"/>
        <use href="#tree" x="850" y="295" width="205" height="410"/>
        <use href="#tree" x="1080" y="315" width="190" height="380"/>
      </g>

      <rect width="1200" height="600" fill="url(#fog)"/>
    </svg>

    <div class="auth-card">
      <div class="auth-logo">
        <svg viewBox="-25 -52 50 64" width="44" height="56">
          <path d="M0,-46 L-9,-26 L-4,-26 L-13,-10 L-6,-10 L-16,6 L16,6 L6,-10 L13,-10 L4,-26 L9,-26 Z" fill="currentColor"/>
          <rect x="-2" y="6" width="4" height="6" fill="currentColor"/>
        </svg>
      </div>
      <h1>Deep Forest</h1>
      <p>Portland's living canopy.</p>
      <form id="auth-form">
        <input type="password" id="auth-input" placeholder="Password" autocomplete="off" />
        <button type="submit">Enter</button>
      </form>
      <div id="auth-error"></div>
    </div>`;
  document.body.appendChild(overlay);

  const style = document.createElement("style");
  style.textContent = `
    #auth-overlay {
      position: fixed; inset: 0; z-index: 1000;
      display: grid; place-items: center;
      background: #060c09;
      overflow: hidden;
    }
    #auth-overlay.hidden { opacity: 0; visibility: hidden; transition: opacity 0.5s, visibility 0.5s; }
    .forest-scene {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
    }
    .forest-scene .layer-far { opacity: 0.55; filter: blur(2.5px); animation: drift-slow 80s ease-in-out infinite alternate; transform-origin: center; }
    .forest-scene .layer-mid { opacity: 0.85; filter: blur(1px); animation: drift-mid 60s ease-in-out infinite alternate; }
    .forest-scene .layer-near { opacity: 1; animation: drift-near 45s ease-in-out infinite alternate; }
    @keyframes drift-slow { 0% { transform: translateX(0); } 100% { transform: translateX(-25px); } }
    @keyframes drift-mid  { 0% { transform: translateX(0); } 100% { transform: translateX(-15px); } }
    @keyframes drift-near { 0% { transform: translateX(0); } 100% { transform: translateX(-8px); } }

    .auth-card {
      position: relative; z-index: 1;
      background: rgba(10, 18, 14, 0.55);
      backdrop-filter: blur(20px) saturate(140%);
      -webkit-backdrop-filter: blur(20px) saturate(140%);
      border: 1px solid rgba(95, 181, 133, 0.18);
      padding: 44px 40px 32px;
      border-radius: 22px;
      box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255,255,255,0.02);
      max-width: 380px;
      width: 90%;
      text-align: center;
      animation: rise 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(24px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .auth-logo {
      color: #6dc193;
      display: inline-flex;
      margin-bottom: 18px;
      filter: drop-shadow(0 0 14px rgba(95, 181, 133, 0.45));
    }
    .auth-card h1 {
      font-size: 30px;
      margin: 0 0 8px;
      font-weight: 500;
      letter-spacing: -0.02em;
      color: #f1ede2;
    }
    .auth-card p {
      color: #8fa195;
      font-size: 13px;
      margin: 0 0 28px;
      letter-spacing: 0.02em;
    }
    #auth-form { display: flex; gap: 8px; }
    #auth-input {
      flex: 1;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px 16px;
      color: #ecf0ec;
      font: inherit; font-size: 14px;
      outline: none;
      transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
    }
    #auth-input:focus {
      border-color: rgba(95, 181, 133, 0.5);
      background: rgba(95, 181, 133, 0.05);
      box-shadow: 0 0 0 3px rgba(95, 181, 133, 0.08);
    }
    #auth-input::placeholder { color: #6b756f; }
    #auth-form button {
      padding: 14px 22px;
      border: none; border-radius: 12px;
      background: linear-gradient(135deg, #6dc193 0%, #4a9e6f 100%);
      color: #0a1410;
      font: inherit; font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.2s;
      box-shadow: 0 4px 14px rgba(95, 181, 133, 0.3);
    }
    #auth-form button:hover { box-shadow: 0 6px 22px rgba(95, 181, 133, 0.55); }
    #auth-form button:active { transform: translateY(1px); }
    #auth-error { color: #d97757; font-size: 12px; margin-top: 14px; min-height: 16px; }
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
let dataContext = null; // aggregated summary sent to the AI as context

// Normalize property keys to lowercase so we don't care about server-side
// field name casing changes.
function normalizeProps(props) {
  if (!props) return {};
  const out = {};
  for (const k of Object.keys(props)) out[k.toLowerCase()] = props[k];
  return out;
}

// Read a property using any of several possible keys (handles renames).
function pick(p, ...keys) {
  for (const k of keys) {
    const v = p[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function setLoaderText(msg) {
  const el = document.querySelector("#loader .loader-inner span");
  if (el) el.textContent = msg;
}

async function fetchPage(offset) {
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
    if (!res.ok) return [];
    const data = await res.json();
    return (data.features || []).map(esriToGeoJSON);
  }
  const fc = await res.json();
  return (fc.features || []).map((f) => ({
    ...f,
    properties: normalizeProps(f.properties),
  }));
}

async function loadTrees() {
  // Get total count first so we know how much to fetch.
  setLoaderText("Counting trees…");
  let total = 100000;
  try {
    const cRes = await fetch(`${FEATURE_SERVER}/query?where=1%3D1&returnCountOnly=true&f=json`);
    if (cRes.ok) {
      const cData = await cRes.json();
      if (cData.count) total = Math.min(cData.count, HARD_CAP);
    }
  } catch {}
  console.log(`[Deep Forest] Server reports ${total.toLocaleString()} trees`);

  const offsets = [];
  for (let o = 0; o < total; o += PAGE_SIZE) offsets.push(o);

  const all = [];
  let loaded = 0;
  let firstLogged = false;

  // Process offsets in parallel batches.
  for (let i = 0; i < offsets.length; i += CONCURRENCY) {
    const chunk = offsets.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(fetchPage));
    for (const feats of results) {
      if (!firstLogged && feats.length) {
        console.log("[Deep Forest] First feature properties:", feats[0].properties);
        firstLogged = true;
      }
      all.push(...feats);
      loaded += feats.length;
    }
    setLoaderText(`Loading the urban canopy… ${loaded.toLocaleString()} of ${total.toLocaleString()}`);
  }
  console.log(`[Deep Forest] Loaded ${all.length} trees`);
  return all;
}

function esriToGeoJSON(f) {
  return {
    type: "Feature",
    geometry: f.geometry
      ? { type: "Point", coordinates: [f.geometry.x, f.geometry.y] }
      : null,
    properties: normalizeProps(f.attributes),
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
        ["coalesce", ["get", "condition"], "Unknown"],
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
    const p = e.features[0].properties;
    const name = pick(p, "species_common", "common") || pick(p, "species_latin", "latin") || "Tree";
    const latin = pick(p, "species_latin", "latin") || "";
    const heritage = pick(p, "ht_status", "heritage") === "Yes"
      ? "<div class='tree-badge heritage'>★ HERITAGE TREE</div>"
      : "";

    const dia = pick(p, "diameter");
    const fy = pick(p, "planting_fy");
    const row = (label, value) => value
      ? `<div class="kv"><span class="k">${label}</span><span class="v">${escapeHtml(String(value))}</span></div>`
      : "";

    const html = `
      <div class="tree-popup-inner">
        <div class="tp-name">${escapeHtml(name)}</div>
        <div class="tp-latin">${escapeHtml(latin)}</div>
        ${heritage}
        <div class="kv-grid">
          ${row("Diameter", dia ? dia + '″' : null)}
          ${row("Height", pick(p, "tree_height"))}
          ${row("Canopy spread", pick(p, "can_spread"))}
          ${row("Condition", pick(p, "condition"))}
          ${row("Native", pick(p, "species_native", "native"))}
          ${row("Mature size", pick(p, "species_mature_size"))}
          ${row("Family", pick(p, "species_family"))}
          ${row("Type", pick(p, "species_functional_type"))}
          ${row("Planted", fy)}
          ${row("Program", pick(p, "program"))}
          ${row("Neighborhood", pick(p, "priority_neighborhood_name", "neighborhood"))}
          ${row("District", pick(p, "council_district"))}
          ${row("Park", pick(p, "park_name"))}
          ${row("Property", pick(p, "prop_type"))}
          ${row("Site type", pick(p, "site_type"))}
          ${row("Site size", pick(p, "site_size"))}
          ${row("Wires", pick(p, "wires"))}
        </div>
        ${pick(p, "upload_address", "address") ? `<div class="tp-addr">${escapeHtml(pick(p, "upload_address", "address"))}</div>` : ""}
      </div>`;
    new maplibregl.Popup({ closeButton: true, maxWidth: "320px", className: "tree-popup" })
      .setLngLat(e.lngLat).setHTML(html).addTo(map);
  });
  map.on("mouseenter", "trees-glow", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "trees-glow", () => (map.getCanvas().style.cursor = ""));
}

let currentFeatures = []; // features currently shown on the map

function applyFilter(filterFn) {
  const features = filterFn ? allFeatures.filter(filterFn) : allFeatures;
  currentFeatures = features;
  map.getSource("trees").setData({ type: "FeatureCollection", features });
  updateStats(features);
  updateInsights(features);
  if (filterFn && features.length > 0) {
    const bounds = new maplibregl.LngLatBounds();
    features.forEach((f) => bounds.extend(f.geometry.coordinates));
    map.fitBounds(bounds, { padding: 80, maxZoom: 16, duration: 800 });
  }
}

function updateStats(features) {
  document.getElementById("visible-count").textContent = features.length.toLocaleString();
  const species = new Set(
    features
      .map((f) => pick(f.properties, "species_common", "common", "species_latin", "latin"))
      .filter(Boolean)
  );
  document.getElementById("species-count").textContent = species.size.toLocaleString();
}

// Build a compact context object the AI can use to map natural language
// (place names, species nicknames) onto exact dataset values.
function buildDataContext(features) {
  const countBy = (key) => {
    const m = new Map();
    for (const f of features) {
      const v = pick(f.properties, key);
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return m;
  };
  const topN = (map, n) =>
    Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);

  const conditions = countBy("condition");
  const propTypes = countBy("prop_type");
  const neighborhoods = countBy("priority_neighborhood_name");
  const districts = countBy("council_district");
  const parks = countBy("park_name");
  const species = countBy("species_common");

  let heritage = 0, native = 0;
  for (const f of features) {
    if (pick(f.properties, "ht_status", "heritage") === "Yes") heritage++;
    if (pick(f.properties, "species_native", "native") === "Yes") native++;
  }

  const families = countBy("species_family");
  const functionalTypes = countBy("species_functional_type");
  const matureSizes = countBy("species_mature_size");
  const programs = countBy("program");
  const heights = countBy("tree_height");
  const canSpreads = countBy("can_spread");
  const wiresMap = countBy("wires");
  const siteTypes = countBy("site_type");

  return {
    total: features.length,
    heritage_count: heritage,
    native_count: native,
    by_condition: Object.fromEntries(conditions),
    by_prop_type: Object.fromEntries(propTypes),
    by_council_district: Object.fromEntries(districts),
    by_mature_size: Object.fromEntries(matureSizes),
    by_functional_type: Object.fromEntries(functionalTypes),
    by_wires: Object.fromEntries(wiresMap),
    neighborhoods: Array.from(neighborhoods.keys()).sort(),
    parks: topN(parks, 100).map(([name, count]) => ({ name, count })),
    top_species: topN(species, 150).map(([name, count]) => ({ name, count })),
    top_families: topN(families, 30).map(([name, count]) => ({ name, count })),
    top_programs: topN(programs, 20).map(([name, count]) => ({ name, count })),
    top_site_types: topN(siteTypes, 15).map(([name, count]) => ({ name, count })),
    height_buckets: Array.from(heights.keys()),
    canopy_spread_buckets: Array.from(canSpreads.keys()),
  };
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
      body: JSON.stringify({ question: q, context: dataContext }),
    });

    if (res.status === 401) {
      localStorage.removeItem(AUTH_KEY);
      location.reload();
      return;
    }
    if (!res.ok) throw new Error(`Chat API: ${res.status}`);
    const data = await res.json();

    thinking.remove();
    const fn = buildFilterFn(data.filter || {});
    applyFilter(fn);
    const count = allFeatures.filter(fn).length;

    let summary = data.summary || "Filtered.";
    summary = summary.replace(/\{count\}/gi, count.toLocaleString());
    if (count === 0) {
      summary = "No trees match that filter. Try something broader like 'oaks' or 'trees in Sellwood'.";
    }
    addMessage("assistant", summary);
  } catch (err) {
    thinking.remove();
    addMessage("assistant", "Couldn't reach the AI. Check your connection and try again.");
  }
});

const ciIncl = (a, b) => String(a || "").toLowerCase().includes(String(b || "").toLowerCase());
const ciEq = (a, b) => String(a || "").toLowerCase().trim() === String(b || "").toLowerCase().trim();

function buildFilterFn(filter) {
  return (f) => {
    const p = f.properties;
    if (filter.common && !ciIncl(pick(p, "species_common", "common"), filter.common)) return false;
    if (filter.latin && !ciIncl(pick(p, "species_latin", "latin"), filter.latin)) return false;
    if (filter.family && !ciIncl(pick(p, "species_family", "family"), filter.family)) return false;
    if (filter.functional_type && !ciIncl(pick(p, "species_functional_type"), filter.functional_type)) return false;
    if (filter.mature_size && !ciEq(pick(p, "species_mature_size"), filter.mature_size)) return false;
    if (filter.native && !ciEq(pick(p, "species_native", "native"), filter.native)) return false;
    if (filter.condition && !ciEq(pick(p, "condition"), filter.condition)) return false;
    const dia = Number(pick(p, "diameter", "dbh"));
    if (filter.diameter_min != null && (isFinite(dia) ? dia : 0) < filter.diameter_min) return false;
    if (filter.diameter_max != null && (isFinite(dia) ? dia : 999) > filter.diameter_max) return false;
    if (filter.height && !ciIncl(pick(p, "tree_height"), filter.height)) return false;
    if (filter.canopy_spread && !ciIncl(pick(p, "can_spread"), filter.canopy_spread)) return false;
    if (filter.neighborhood && !ciIncl(pick(p, "priority_neighborhood_name", "neighborhood"), filter.neighborhood)) return false;
    if (filter.council_district && !ciIncl(pick(p, "council_district"), filter.council_district)) return false;
    if (filter.prop_type && !ciIncl(pick(p, "prop_type"), filter.prop_type)) return false;
    if (filter.park_name && !ciIncl(pick(p, "park_name"), filter.park_name)) return false;
    if (filter.site_type && !ciIncl(pick(p, "site_type"), filter.site_type)) return false;
    if (filter.site_size && !ciIncl(pick(p, "site_size"), filter.site_size)) return false;
    if (filter.wires && !ciEq(pick(p, "wires"), filter.wires)) return false;
    if (filter.program && !ciIncl(pick(p, "program"), filter.program)) return false;
    const fy = Number(pick(p, "planting_fy"));
    if (filter.planting_year_min != null && (isFinite(fy) ? fy : 0) < filter.planting_year_min) return false;
    if (filter.planting_year_max != null && (isFinite(fy) ? fy : 9999) > filter.planting_year_max) return false;
    if (filter.heritage && !ciEq(pick(p, "ht_status", "heritage"), filter.heritage)) return false;
    return true;
  };
}

// ── Brand menu ───────────────────────────────────────────────────────
const brandButton = document.getElementById("brand-button");
const brandMenu = document.getElementById("brand-menu");
brandButton?.addEventListener("click", (e) => {
  e.stopPropagation();
  brandMenu.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!brandMenu.contains(e.target) && !brandButton.contains(e.target)) {
    brandMenu.classList.remove("open");
  }
});

// ── Insights panel ───────────────────────────────────────────────────
const insightsPanel = document.getElementById("insights-panel");
const insightsToggle = document.getElementById("insights-toggle");
const insightsClose = document.getElementById("insights-close");
insightsToggle?.addEventListener("click", () => {
  insightsPanel.classList.toggle("open");
  if (insightsPanel.classList.contains("open")) updateInsights(currentFeatures);
});
insightsClose?.addEventListener("click", () => insightsPanel.classList.remove("open"));

function renderBars(elId, entries, total) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!entries.length) {
    el.innerHTML = '<div style="color:var(--text-faint); font-size:12px;">No data.</div>';
    return;
  }
  const max = Math.max(...entries.map((e) => e[1]));
  el.innerHTML = entries.map(([name, count]) => {
    const pct = Math.max(2, (count / max) * 100);
    const share = total ? ((count / total) * 100).toFixed(1) + "%" : "";
    return `
      <div class="bar-row">
        <div class="bar-name">
          <div class="bar-fill" style="width:${pct}%"></div>
          <div class="bar-text">${escapeHtml(name)}</div>
        </div>
        <div class="bar-value">${count.toLocaleString()}<span style="opacity:0.5; margin-left:4px;">${share}</span></div>
      </div>`;
  }).join("");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function updateInsights(features) {
  if (!insightsPanel || !insightsPanel.classList.contains("open")) return;
  if (!features) return;

  const total = features.length;

  // KPIs
  const speciesSet = new Set(features.map((f) => pick(f.properties, "species_common")).filter(Boolean));
  let native = 0, heritage = 0;
  for (const f of features) {
    if (pick(f.properties, "species_native") === "Yes") native++;
    if (pick(f.properties, "ht_status") === "Yes") heritage++;
  }
  document.getElementById("kpi-total").textContent = total.toLocaleString();
  document.getElementById("kpi-species").textContent = speciesSet.size.toLocaleString();
  document.getElementById("kpi-native").textContent = native.toLocaleString();
  document.getElementById("kpi-heritage").textContent = heritage.toLocaleString();

  // Helpers
  const countBy = (key) => {
    const m = new Map();
    for (const f of features) {
      const v = pick(f.properties, key);
      if (v) m.set(v, (m.get(v) || 0) + 1);
    }
    return m;
  };
  const topN = (map, n) =>
    Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n);

  renderBars("bars-species", topN(countBy("species_common"), 10), total);

  // Condition in a fixed order
  const condMap = countBy("condition");
  const condOrder = ["Good", "Fair", "Poor", "Dead"];
  renderBars("bars-condition",
    condOrder.filter((k) => condMap.has(k)).map((k) => [k, condMap.get(k)]),
    total);

  renderBars("bars-neighborhood", topN(countBy("priority_neighborhood_name"), 10), total);
  renderBars("bars-prop", topN(countBy("prop_type"), 8), total);
  renderBars("bars-family", topN(countBy("species_family"), 10), total);
  renderBars("bars-functional", topN(countBy("species_functional_type"), 8), total);

  // Mature size with fixed order
  const sizeMap = countBy("species_mature_size");
  const sizeOrder = ["Small", "Medium", "Large"];
  renderBars("bars-mature",
    sizeOrder.filter((k) => sizeMap.has(k)).map((k) => [k, sizeMap.get(k)]),
    total);

  renderBars("bars-program", topN(countBy("program"), 10), total);
  renderBars("bars-wires", topN(countBy("wires"), 5), total);

  // Subtitle
  document.getElementById("insights-subtitle").textContent =
    total === allFeatures.length
      ? "Live for the current view"
      : `Live for ${total.toLocaleString()} filtered trees`;
}

// ── Time Machine ─────────────────────────────────────────────────────
const tmBackdrop = document.getElementById("time-machine-backdrop");
const tmClose = document.getElementById("tm-close");
const tmSlider = document.getElementById("tm-slider");
const tmYear = document.getElementById("tm-year");
const tmStats = document.getElementById("tm-stats");
const tmPlay = document.getElementById("tm-play");
const tmReset = document.getElementById("tm-reset");
let tmPlaying = false;
let tmTimer = null;

document.getElementById("open-time-machine")?.addEventListener("click", () => {
  brandMenu.classList.remove("open");
  tmBackdrop.classList.add("open");
  // Set max year based on the data
  const years = allFeatures.map((f) => Number(pick(f.properties, "planting_fy"))).filter((n) => isFinite(n) && n > 1800);
  const maxYear = years.length ? Math.max(...years) : new Date().getFullYear();
  const minYear = years.length ? Math.max(1900, Math.min(...years)) : 1900;
  tmSlider.min = minYear;
  tmSlider.max = maxYear;
  tmSlider.value = maxYear;
  applyTimeMachine(maxYear);
});

tmClose?.addEventListener("click", closeTimeMachine);
tmBackdrop?.addEventListener("click", (e) => {
  if (e.target === tmBackdrop) closeTimeMachine();
});

tmSlider?.addEventListener("input", (e) => applyTimeMachine(Number(e.target.value)));

tmPlay?.addEventListener("click", () => {
  if (tmPlaying) {
    stopPlay();
  } else {
    tmPlaying = true;
    tmPlay.textContent = "⏸ Pause";
    const max = Number(tmSlider.max);
    const min = Number(tmSlider.min);
    let y = Number(tmSlider.value);
    if (y >= max) y = min;
    tmTimer = setInterval(() => {
      y += 1;
      if (y > max) {
        stopPlay();
        return;
      }
      tmSlider.value = y;
      applyTimeMachine(y);
    }, 120);
  }
});

tmReset?.addEventListener("click", () => {
  const max = Number(tmSlider.max);
  tmSlider.value = max;
  applyTimeMachine(max);
  stopPlay();
});

function stopPlay() {
  tmPlaying = false;
  tmPlay.textContent = "▶ Play";
  if (tmTimer) { clearInterval(tmTimer); tmTimer = null; }
}

function closeTimeMachine() {
  stopPlay();
  tmBackdrop.classList.remove("open");
  applyFilter(null); // restore full view
}

function applyTimeMachine(year) {
  tmYear.textContent = year;
  const fn = (f) => {
    const fy = Number(pick(f.properties, "planting_fy"));
    return isFinite(fy) && fy > 0 && fy <= year;
  };
  const matched = allFeatures.filter(fn);
  // Don't auto-zoom while scrubbing — keep current view stable.
  currentFeatures = matched;
  map.getSource("trees").setData({ type: "FeatureCollection", features: matched });
  updateStats(matched);
  updateInsights(matched);
  tmStats.textContent = `${matched.toLocaleString ? matched.length.toLocaleString() : matched.length} trees planted by ${year}`;
}

// ── Boot ─────────────────────────────────────────────────────────────
map.on("load", async () => {
  await ensureAuth();
  try {
    allFeatures = await loadTrees();
    currentFeatures = allFeatures;
    dataContext = buildDataContext(allFeatures);
    console.log("[Deep Forest] Built data context:", dataContext);
    addLayers(allFeatures);
    updateStats(allFeatures);
    // Update brand subtitle with real tree count
    const sub = document.querySelector(".brand-text .sub");
    if (sub) sub.textContent = `Portland · ${allFeatures.length.toLocaleString()} trees`;
    document.getElementById("loader").classList.add("hidden");
  } catch (err) {
    console.error(err);
    document.getElementById("loader").innerHTML =
      `<div class="loader-inner"><span style="color:#d97757">Couldn't load tree data.<br>${err.message}</span></div>`;
  }
});
