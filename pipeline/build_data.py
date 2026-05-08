"""
Pull the latest Portland Street Tree Inventory from the City's ArcGIS
FeatureServer and write a compact GeoJSON + Parquet file the front-end
can use. Runs weekly via .github/workflows/update-data.yml.

When you find the new canopy dataset, add a second SOURCE entry and a
second build step.
"""
import json
import pathlib
import sys

import duckdb
import requests

OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "trees": {
        "url": "https://www.portlandmaps.com/arcgis/rest/services/Public/Trees_Inventory/MapServer/0/query",
        "fields": "OBJECTID,Genus,Species,Common,DBH,Condition,Address,Site_Type,Inventory_",
    },
}

PAGE = 2000


def fetch_all(url: str, fields: str) -> list[dict]:
    """Page through an ArcGIS FeatureServer and return GeoJSON features."""
    all_feats: list[dict] = []
    offset = 0
    while True:
        params = {
            "where": "1=1",
            "outFields": fields,
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "resultRecordCount": PAGE,
            "resultOffset": offset,
        }
        r = requests.get(url, params=params, timeout=60)
        r.raise_for_status()
        fc = r.json()
        feats = fc.get("features", [])
        if not feats:
            break
        all_feats.extend(feats)
        if len(feats) < PAGE:
            break
        offset += PAGE
        print(f"  …{len(all_feats):,} features")
    return all_feats


def write_geojson(name: str, feats: list[dict]) -> pathlib.Path:
    p = OUT_DIR / f"{name}.geojson"
    p.write_text(json.dumps({"type": "FeatureCollection", "features": feats}))
    return p


def write_parquet(name: str, geojson_path: pathlib.Path) -> pathlib.Path:
    """Use DuckDB's spatial extension to convert GeoJSON → Parquet."""
    p = OUT_DIR / f"{name}.parquet"
    con = duckdb.connect()
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute(
        f"""
        COPY (
          SELECT * FROM ST_Read('{geojson_path.as_posix()}')
        ) TO '{p.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)
        """
    )
    return p


def main() -> int:
    for name, src in SOURCES.items():
        print(f"\n[{name}] fetching…")
        feats = fetch_all(src["url"], src["fields"])
        print(f"[{name}] got {len(feats):,} features")

        gj = write_geojson(name, feats)
        print(f"[{name}] wrote {gj} ({gj.stat().st_size/1e6:.1f} MB)")

        pq = write_parquet(name, gj)
        print(f"[{name}] wrote {pq} ({pq.stat().st_size/1e6:.1f} MB)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
