"""Builds Nigeria's built-up areas from the GHSL settlement model (GHS-SMOD).

Usage: python build_built_up_areas.py <GHS_SMOD_..._54009_1000_V2_0.zip> <out.geojson.gz>

Needs rasterio, shapely and pyproj. Source:
https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_SMOD_GLOBE_R2023A/

Cells classed urban centre (30) or urban cluster (21-23) count as built up.
Rural clusters (13, villages) do not: a highway past a village is open road.
"""

import gzip
import json
import sys

import numpy as np
import rasterio
import shapely
from pyproj import Transformer
from rasterio.features import shapes
from rasterio.windows import from_bounds
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

# Nigeria plus a margin for border crossings, in lon/lat.
BOUNDS = (2.5, 4.0, 15.0, 14.1)
KINDS = {"urban_centre": (30, 30), "urban_cluster": (21, 23)}
# Cells are 1 km; 0.002 deg (~200 m) removes the grid staircase without moving edges far.
SIMPLIFY_DEG = 0.002


def read_window(path: str):
    src = rasterio.open(f"zip://{path}!/GHS_SMOD_E2025_GLOBE_R2023A_54009_1000_V2_0.tif")
    to_moll = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
    xs, ys = to_moll.transform([BOUNDS[0], BOUNDS[2]] * 2, [BOUNDS[1]] * 2 + [BOUNDS[3]] * 2)
    window = from_bounds(min(xs), min(ys), max(xs), max(ys), src.transform)
    return src.read(1, window=window), src.window_transform(window), src.crs


def polygons(grid, affine, low: int, high: int):
    mask = ((grid >= low) & (grid <= high)).astype(np.uint8)
    return [shape(geom) for geom, value in shapes(mask, mask=mask.astype(bool), transform=affine) if value == 1]


def main(source: str, target: str) -> None:
    grid, affine, crs = read_window(source)
    to_wgs84 = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    reproject = lambda coords: np.column_stack(to_wgs84.transform(coords[:, 0], coords[:, 1]))
    features = []
    for kind, (low, high) in KINDS.items():
        merged = unary_union(polygons(grid, affine, low, high))
        lonlat = shapely.transform(merged, reproject).simplify(SIMPLIFY_DEG, preserve_topology=True)
        parts = getattr(lonlat, "geoms", [lonlat])
        features += [{"type": "Feature", "properties": {"kind": kind}, "geometry": mapping(p)} for p in parts if not p.is_empty]
    collection = {"type": "FeatureCollection", "source": "GHS-SMOD E2025 R2023A V2-0", "features": features}
    with gzip.open(target, "wt", encoding="utf-8") as out:
        json.dump(collection, out, separators=(",", ":"))
    print(f"{len(features)} polygons -> {target}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
