// Street Tree Explorer — front-end app
// Loads Portland Street Tree Inventory from the City's ArcGIS FeatureServer,
// renders on a MapLibre map, and routes chat questions to a Worker that
// returns a structured filter the browser applies locally.

// ── Config ────────────────────────────────────────────────────────────
// Live source — Portland's Urban Forestry tree layers (All Trees layer).
const FEATURE_SERVER =
  "https://www.portlandmaps.com/arcgis/rest/services/Public/Parks_UF_Tree_Layers/MapServer/12";

// Replace with your deployed Worker URL once you're ready (e.g. https://chat.killtimber.com)
const CHAT_API = "/api/chat";

// MaxRecordCount on Portland's MapServer is 2000.
// We page through to load up to TARGET_TOTAL records.
const PAGE_SIZE = 2000;
const TARGET_TOTAL = 20000;

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
  center: [-122.6765, 45.5231], // Portland
  zoom: 11.5,
  pitch: 0,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");

// ── Data ─────────────────────────────────────────────────────────────
let allFeatures = []; // GeoJSON features, full set
let filteredIds = null; // Set<string> | null (null = show all)

async function loadTrees() {
  // Page through the FeatureServer 2000 records at a time. Try GeoJSON
  // first; fall back to Esri JSON for older MapServers that don't support it.
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

    // Fallback to Esri JSON if GeoJSON is not supported on this layer.
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
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        10, 1.2, 13, 3, 16, 8, 19, 18,
      ],
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

  // Click → popup
  map.on("click", "trees-glow", (e) => {
    const f = e.features[0];
    const p = f.properties;
    const html = `
      <div style="font: 13px/1.5 Inter, sans-serif; color: #ecf0ec; min-width: 180px;">
        <div style="font-weight: 600; margin-bottom: 4px;">${p.Common || p.Species || "Tree"}</div>
        <div style="color: #a0aaa3; font-size: 11px; margin-bottom: 6px;">
          ${p.Genus || ""} ${p.Species || ""}
        </div>
        <div><b>DBH:</b> ${p.DBH || "—"}″</div>
        <div><b>Condition:</b> ${p.Condition || "—"}</div>
        <div><b>Address:</b> ${p.Address || "—"}</div>
      </div>`;
    new maplibregl.Popup({ closeButton: false, className: "tree-popup" })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
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
  document.getElementById("visible-count").textContent =
    features.length.toLocaleString();
  const species = new Set(
    features.map((f) => f.properties.Species).filter(Boolean)
  );
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: q }),
    });

    if (!res.ok) throw new Error(`Chat API: ${res.status}`);
    const data = await res.json();

    // Expected shape: { filter: { genus?, species?, condition?, dbh_min?, dbh_max?, common? }, summary: string }
    thinking.remove();
    if (data.filter) applyFilter(buildFilterFn(data.filter));
    addMessage("assistant", data.summary || "Done — map updated.");
  } catch (err) {
    thinking.remove();
    // Local fallback: simple keyword match so the demo works without the Worker.
    const localFilter = localFallback(q);
    if (localFilter) {
      applyFilter(localFilter.fn);
      addMessage("assistant", `(offline mode) Filtered to ${localFilter.label}.`);
    } else {
      addMessage(
        "assistant",
        "I need the chat API to be deployed for that. (See README.) Try a keyword like 'maple' or 'poor condition' for a local demo."
      );
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

const ciEq = (a, b) =>
  String(a || "").toLowerCase().trim() === String(b || "").toLowerCase().trim();
const ciIncludes = (a, b) =>
  String(a || "").toLowerCase().includes(String(b || "").toLowerCase());

// Quick local-only filter so the page is useful before the Worker is deployed.
function localFallback(q) {
  const lower = q.toLowerCase();
  const conditions = ["good", "fair", "poor", "dead"];
  for (const c of conditions) {
    if (lower.includes(c + " condition") || lower.includes("in " + c)) {
      return {
        label: `${c} condition`,
        fn: (f) => ciEq(f.properties.Condition, c[0].toUpperCase() + c.slice(1)),
      };
    }
  }
  // genus keyword
  const m = lower.match(/\b(maple|oak|cherry|plum|magnolia|pine|fir|elm|ash|cedar|dogwood|linden|birch)s?\b/);
  if (m) {
    return {
      label: `${m[1]}s`,
      fn: (f) => ciIncludes(f.properties.Common, m[1]),
    };
  }
  return null;
}

// ── Boot ─────────────────────────────────────────────────────────────
map.on("load", async () => {
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
