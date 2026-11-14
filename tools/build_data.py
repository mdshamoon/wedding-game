"""Build game data from OpenStreetMap + satellite imagery.

Run:  npm run data   (uv run --with pillow --with numpy --with duckdb python tools/build_data.py)
Outputs into public/data/.

Coordinate system (must match src/geo.js):
  Web-Mercator metres scaled by cos(lat0), origin = Home pin.
  +x = east, +z = south  (so north is -z, matching three.js "forward").
"""
import json, math, os, sys, heapq, random, concurrent.futures as cf, urllib.request, io
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import footprints as fp

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "osm.json")
FOOTPRINTS = os.path.join(ROOT, "data", "raw", "overture_buildings.csv")
OUT = os.path.join(ROOT, "public", "data")
TILE_CACHE = os.environ.get("TILE_CACHE", os.path.join(ROOT, "data", "tilecache"))
os.makedirs(OUT, exist_ok=True)
os.makedirs(TILE_CACHE, exist_ok=True)

R = 6378137.0
LAT0, LON0 = 28.904844, 79.473051  # Home
K = math.cos(math.radians(LAT0))

PLACES = {
    "home": (28.904844, 79.473051),
    "baraat": (28.7832891, 79.4993533),     # Blessing Garden, Baheri
    "reception": (28.9193237, 79.4988937),  # Grand Heritage Resort, Kichha
    "kichha": (28.9103155, 79.5189401),     # Kichha town centre (OSM)
    "darau": (28.9055763, 79.5048674),      # Darau Chowk, Bareilly Road (mithai stop)
    "azad": (28.8968022, 79.4881592),       # Azad Nagar, Sonera (Google Maps)
}
BBOX = (28.770, 79.450, 28.935, 79.525)  # s, w, n, e


def merc(lat, lon):
    return R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


MX0, MY0 = merc(LAT0, LON0)


def to_local(lat, lon):
    mx, my = merc(lat, lon)
    return (mx - MX0) * K, -(my - MY0) * K


def local_to_merc(x, z):
    return x / K + MX0, MY0 - z / K


WIDTH = {
    "trunk": 13.0, "trunk_link": 7.0, "primary": 11.0, "primary_link": 7.0, "secondary": 9.0,
    "tertiary": 8.0, "unclassified": 6.0, "residential": 5.5, "living_street": 4.5,
    "service": 4.0, "services": 6.0, "track": 3.5, "path": 2.0, "pedestrian": 4.0,
}
SPEED = {  # km/h-ish routing preference
    "trunk": 80, "trunk_link": 50, "primary": 60, "primary_link": 40, "secondary": 50, "tertiary": 40,
    "unclassified": 30, "residential": 25, "living_street": 15, "service": 15, "services": 15, "track": 10,
}


def load_osm():
    return json.load(open(RAW))["elements"]


# ---------------------------------------------------------------- roads + graph
def build_roads(els):
    roads, graph, nodepos, nodetype = [], {}, {}, {}
    for e in els:
        if e["type"] != "way":
            continue
        t = e.get("tags", {})
        hw = t.get("highway")
        if hw not in WIDTH:
            continue
        geom = e.get("geometry") or []
        pts = [to_local(g["lat"], g["lon"]) for g in geom]
        if len(pts) < 2:
            continue
        flat = []
        for x, z in pts:
            flat += [round(x, 1), round(z, 1)]
        lanes = t.get("lanes")
        w = WIDTH[hw]
        if lanes and lanes.isdigit() and hw in ("trunk", "primary", "secondary"):
            w = max(w, int(lanes) * 3.4 + 2)
        roads.append({
            "t": hw, "n": t.get("name:en") or t.get("name") or t.get("ref") or "",
            "w": round(w, 1), "o": 1 if t.get("oneway") == "yes" else 0,
            "s": t.get("surface", ""), "p": flat,
            "lanes": int(lanes) if lanes and lanes.isdigit() else 0,
        })
        if hw in SPEED:
            ids = e["nodes"]
            for i, nid in enumerate(ids):
                nodepos[nid] = pts[i]
                nodetype[nid] = max(nodetype.get(nid, 0), SPEED[hw])
            for i in range(len(ids) - 1):
                a, b = ids[i], ids[i + 1]
                (x1, z1), (x2, z2) = pts[i], pts[i + 1]
                L = math.hypot(x2 - x1, z2 - z1)
                cost = L / SPEED[hw]
                graph.setdefault(a, []).append((b, cost))
                graph.setdefault(b, []).append((a, cost))
    return roads, graph, nodepos, nodetype


def divided_carriageways(roads):
    """Pair up one-way trunk/primary carriageways (e.g. NH9) and set realistic widths + a median.

    For each one-way major road, find the opposite-direction carriageway running alongside. Its
    width becomes lanes*3.5 m + a paved shoulder (capped so the two don't overlap) and "m" stores
    the half-median width on the side where the other carriageway is (+ = right of travel).
    """
    cell = 40.0
    grid = {}
    ow = [i for i, r in enumerate(roads) if r["o"] and r["t"] in ("trunk", "primary")]
    for i in ow:
        p = roads[i]["p"]
        for k in range(0, len(p) - 2, 2):
            for gi in range(int(min(p[k], p[k + 2]) // cell) - 1, int(max(p[k], p[k + 2]) // cell) + 2):
                for gj in range(int(min(p[k + 1], p[k + 3]) // cell) - 1, int(max(p[k + 1], p[k + 3]) // cell) + 2):
                    grid.setdefault((gi, gj), []).append((i, p[k], p[k + 1], p[k + 2], p[k + 3]))
    paired = 0
    for i in ow:
        r = roads[i]; p = r["p"]
        seps, sides = [], []
        for k in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[k], p[k + 1], p[k + 2], p[k + 3]
            L = math.hypot(bx - ax, bz - az)
            if L < 1:
                continue
            ux, uz = (bx - ax) / L, (bz - az) / L
            for t in np.arange(0, L, 12.0):
                x, z = ax + ux * t, az + uz * t
                best = None
                for (j, cx1, cz1, cx2, cz2) in grid.get((int(x // cell), int(z // cell)), ()):
                    if j == i:
                        continue
                    vl = math.hypot(cx2 - cx1, cz2 - cz1) or 1
                    if (ux * (cx2 - cx1) + uz * (cz2 - cz1)) / vl > -0.8:
                        continue  # not running the opposite way
                    d = seg_dist(x, z, cx1, cz1, cx2, cz2)
                    if 6 < d < 45 and (best is None or d < best[0]):
                        vx, vz = cx2 - cx1, cz2 - cz1
                        L2 = vl * vl; tt = max(0, min(1, ((x - cx1) * vx + (z - cz1) * vz) / L2))
                        qx, qz = cx1 + vx * tt, cz1 + vz * tt
                        best = (d, 1 if (qx - x) * (-uz) + (qz - z) * ux > 0 else -1)
                if best:
                    seps.append(best[0]); sides.append(best[1])
        n_samples = max(1, int(sum(math.hypot(p[k + 2] - p[k], p[k + 3] - p[k + 1]) for k in range(0, len(p) - 2, 2)) / 12))
        if len(seps) >= max(2, 0.5 * n_samples):
            sep = float(np.median(seps))
            lanes = r.get("lanes") or 2
            want = min(max(lanes, 2), 3) * 3.5 + 1.5
            w = max(7.0, min(want, sep - 2.0))
            side = 1 if sum(sides) >= 0 else -1
            r["w"] = round(w, 1)
            r["m"] = round(side * (sep - w) / 2, 1)
            paired += 1
    print(f"divided carriageways paired: {paired}/{len(ow)}")


def nearest_node(nodepos, nodetype, x, z, min_speed=0):
    best, bd = None, 1e18
    for nid, (nx, nz) in nodepos.items():
        if nodetype.get(nid, 0) < min_speed:
            continue
        d = (nx - x) ** 2 + (nz - z) ** 2
        if d < bd:
            best, bd = nid, d
    return best, math.sqrt(bd)


def dijkstra(graph, a, b):
    dist, prev, pq = {a: 0}, {}, [(0, a)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == b:
            break
        if d > dist.get(u, 1e18):
            continue
        for v, c in graph.get(u, ()):
            nd = d + c
            if nd < dist.get(v, 1e18):
                dist[v], prev[v] = nd, u
                heapq.heappush(pq, (nd, v))
    if b not in dist:
        return None
    path = [b]
    while path[-1] != a:
        path.append(prev[path[-1]])
    return path[::-1]


def route(graph, nodepos, nodetype, frm, to, min_speed_from=0, min_speed_to=0):
    fa, da = nearest_node(nodepos, nodetype, *frm, min_speed=min_speed_from)
    fb, db = nearest_node(nodepos, nodetype, *to, min_speed=min_speed_to)
    ids = dijkstra(graph, fa, fb)
    if not ids:
        raise SystemExit(f"no route {frm}->{to}")
    pts = [nodepos[i] for i in ids]
    L = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
    return pts, L, da, db


# ---------------------------------------------------------------- satellite built-up mask
TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
MZ = 16


def tile_xy(lat, lon, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def fetch_tile(z, x, y):
    p = os.path.join(TILE_CACHE, f"{z}_{x}_{y}.jpg")
    if not os.path.exists(p):
        req = urllib.request.Request(TILE_URL.format(z=z, x=x, y=y), headers={"User-Agent": "wedding-game-data/0.1"})
        with urllib.request.urlopen(req, timeout=30) as r:
            open(p, "wb").write(r.read())
    return p


def build_mosaic():
    s, w, n, e = BBOX
    x0, y0 = tile_xy(n, w, MZ)
    x1, y1 = tile_xy(s, e, MZ)
    tx0, ty0, tx1, ty1 = int(x0), int(y0), int(x1), int(y1)
    jobs = [(MZ, x, y) for y in range(ty0, ty1 + 1) for x in range(tx0, tx1 + 1)]
    print(f"mosaic tiles: {len(jobs)}")
    with cf.ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda j: fetch_tile(*j), jobs))
    W, H = (tx1 - tx0 + 1) * 256, (ty1 - ty0 + 1) * 256
    img = Image.new("RGB", (W, H))
    for (_, x, y) in jobs:
        img.paste(Image.open(os.path.join(TILE_CACHE, f"{MZ}_{x}_{y}.jpg")).convert("RGB"),
                  ((x - tx0) * 256, (y - ty0) * 256))
    # mosaic -> local coordinates of pixel (0,0) corner and metres per pixel
    size = 2 * math.pi * R / 2 ** MZ
    mx_left = tx0 * size - math.pi * R
    my_top = math.pi * R - ty0 * size
    ox, oz = (mx_left - MX0) * K, -(my_top - MY0) * K
    mpp = size / 256 * K
    return np.asarray(img).astype(np.float32) / 255.0, ox, oz, mpp


def box_blur(a, r):
    """Separable box blur with integral images (radius r pixels)."""
    pad = np.pad(a, r, mode="edge")
    c = pad.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def road_raster(roads, shape, ox, oz, mpp):
    """Rasterise OSM roads so road surfaces don't count as rooftops."""
    from PIL import ImageDraw
    H, W = shape
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    for rd in roads:
        p = rd["p"]
        pts = [((p[i] - ox) / mpp, (p[i + 1] - oz) / mpp) for i in range(0, len(p), 2)]
        d.line(pts, fill=255, width=max(1, int(round((rd["w"] + 3) / mpp))))
    return np.asarray(im) > 0


def built_mask(img, roadmask=None):
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    exg = (2 * g - r - b)  # vegetation
    mx, mn = img.max(-1), img.min(-1)
    sat = (mx - mn) / (mx + 1e-4)
    # local texture: std of luminance in ~3px window
    m1 = box_blur(lum, 1)
    m2 = box_blur(lum * lum, 1)
    std = np.sqrt(np.clip(m2 - m1 * m1, 0, None))
    veg = box_blur(exg, 2)
    # Texture is the robust signal across differently-toned captures: dense rooftops are "busy",
    # fields (green or ploughed) are smooth, tree canopy is darker.
    tex = box_blur(std, 3)
    mlum = box_blur(lum, 3)
    builtpx = (tex > 0.045) & (mlum > 0.32) & (veg < 0.11)
    water = (b > g) & (b > r) & (lum < 0.35)
    builtpx &= ~water
    if roadmask is not None:
        builtpx &= ~roadmask
    density = box_blur(builtpx.astype(np.float32), 6)  # ~25 m neighbourhood
    fine = box_blur(builtpx.astype(np.float32), 1)     # ~6 m: is there roof right here?
    green = box_blur((veg > 0.06).astype(np.float32), 4)
    return density, green, water, fine


# ---------------------------------------------------------------- building placement
class Grid:
    def __init__(self, cell=4.0):
        self.c, self.d = cell, {}

    def keys(self, x0, z0, x1, z1):
        c = self.c
        for i in range(int(math.floor(x0 / c)), int(math.floor(x1 / c)) + 1):
            for j in range(int(math.floor(z0 / c)), int(math.floor(z1 / c)) + 1):
                yield (i, j)


def obb_corners(cx, cz, w, d, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    out = []
    for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        lx, lz = sx * w / 2, sz * d / 2
        out.append((cx + lx * ca - lz * sa, cz + lx * sa + lz * ca))
    return out


def seg_dist(px, pz, ax, az, bx, bz):
    dx, dz = bx - ax, bz - az
    L2 = dx * dx + dz * dz or 1e-9
    t = max(0, min(1, ((px - ax) * dx + (pz - az) * dz) / L2))
    qx, qz = ax + t * dx, az + t * dz
    return math.hypot(px - qx, pz - qz)


def place_buildings(roads, sample_density, venues, occ0=None, fine=None):
    """Procedural row buildings along roads. With occ0 (cells taken by real footprints) and a fine
    built-up sampler it only fills gaps in the street frontage where the imagery shows roofs."""
    rnd = random.Random(2027)
    infill = occ0 is not None
    seg_grid = {}
    SC = 20.0
    for ri, rd in enumerate(roads):
        p = rd["p"]
        for i in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[i], p[i + 1], p[i + 2], p[i + 3]
            for gi in range(int(min(ax, bx) // SC) - 1, int(max(ax, bx) // SC) + 2):
                for gj in range(int(min(az, bz) // SC) - 1, int(max(az, bz) // SC) + 2):
                    seg_grid.setdefault((gi, gj), []).append((ax, az, bx, bz, rd["w"] / 2))

    def road_clear(x, z, rad):
        for s in seg_grid.get((int(x // SC), int(z // SC)), ()):
            if seg_dist(x, z, s[0], s[1], s[2], s[3]) < rad + s[4] + 1.0:
                return False
        return True

    occ = set(occ0) if occ0 else set()
    OC = 2.0

    def occ_cells(corners):
        xs = [c[0] for c in corners]; zs = [c[1] for c in corners]
        cells = []
        for i in range(int(min(xs) // OC), int(max(xs) // OC) + 1):
            for j in range(int(min(zs) // OC), int(max(zs) // OC) + 1):
                cells.append((i, j))
        return cells

    def near_venue(x, z, extra=0):
        for (vx, vz, vr) in venues:
            if (x - vx) ** 2 + (z - vz) ** 2 < (vr + extra) ** 2:
                return True
        return False

    out = []
    order = sorted(range(len(roads)), key=lambda i: -WIDTH.get(roads[i]["t"], 3))
    for ri in order:
        rd = roads[ri]
        if rd["t"] in ("path", "track", "trunk_link", "primary_link"):
            continue
        p = rd["p"]
        hw = rd["w"] / 2
        major = rd["t"] in ("trunk", "primary", "secondary", "tertiary")
        for i in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[i], p[i + 1], p[i + 2], p[i + 3]
            L = math.hypot(bx - ax, bz - az)
            if L < 6:
                continue
            ux, uz = (bx - ax) / L, (bz - az) / L
            nx, nz = -uz, ux
            ang = math.atan2(uz, ux)
            for side in (-1, 1):
                t = rnd.uniform(1, 4)
                while t < L - 3:
                    mx, mz = ax + ux * t, az + uz * t
                    dens = sample_density(mx + nx * side * (hw + 8), mz + nz * side * (hw + 8))
                    front = rnd.uniform(6, 11) if dens > 0.5 else rnd.uniform(8, 15)
                    if dens < 0.22:
                        t += front + rnd.uniform(4, 20)
                        continue
                    depth = rnd.uniform(9, 16) if dens > 0.45 else rnd.uniform(8, 13)
                    setback = (1.5 if major else 1.0) + (rnd.uniform(0, 2) if dens < 0.4 else rnd.uniform(0, 0.6))
                    rows = (2 if dens > 0.6 and rnd.random() < 0.5 else 1) if infill else (2 if dens > 0.55 and rnd.random() < 0.7 else 1)
                    if infill and dens < 0.4:
                        t += front + rnd.uniform(2, 8)
                        continue
                    off = hw + setback
                    for row in range(rows):
                        cx = mx + ux * front / 2 + nx * side * (off + depth / 2)
                        cz = mz + uz * front / 2 + nz * side * (off + depth / 2)
                        if near_venue(cx, cz):
                            break
                        if sample_density(cx, cz) < 0.2:
                            break
                        if fine is not None and fine(cx, cz) < (0.33 if dens > 0.55 else 0.5):
                            break
                        if not road_clear(cx, cz, max(front, depth) * 0.5):
                            break
                        corners = obb_corners(cx, cz, front - 0.3, depth, ang)
                        cells = occ_cells(corners)
                        if any(c in occ for c in cells):
                            break
                        occ.update(cells)
                        floors = 1 + (rnd.random() < dens) + (rnd.random() < dens * 0.6) + (rnd.random() < dens * 0.15)
                        shop = 1 if (major and row == 0 and dens > 0.35 and rnd.random() < 0.75) else 0
                        style = rnd.randrange(12)
                        out.append([round(cx, 1), round(cz, 1), round(front - 0.3, 1), round(depth, 1),
                                    round(ang + (math.pi if side < 0 else 0), 3), floors, style, shop])
                        off += depth + rnd.uniform(0.0, 3.0)
                        depth = rnd.uniform(8, 14)
                    t += front + (rnd.uniform(0, 0.4) if dens > 0.5 else rnd.uniform(1, 6))
    return out, road_clear, occ, OC


STREET_W = {  # handcart, motorbike, kiosk, person, bicycle, cow, charpai, haystack
    "market": [20, 30, 6, 30, 8, 2, 4, 0],
    "town": [7, 28, 4, 20, 15, 9, 10, 0],
    "village": [1, 14, 0, 12, 18, 22, 18, 12],
}


def street_props(roads, sd, ridx, occ, OC, places, venues):
    """Street life along the kerbs: dense in the bazaar, sparse in villages. Never on a road or
    inside a building. Output rows: [type, x*10, z*10, angle*100, variant]."""
    rnd = random.Random(424)
    kx, kz = places["kichha"]
    out = []
    for rd in roads:
        if rd["t"] in ("path", "track", "trunk_link", "primary_link", "service"):
            continue
        p, hw = rd["p"], rd["w"] / 2
        for i in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[i], p[i + 1], p[i + 2], p[i + 3]
            L = math.hypot(bx - ax, bz - az)
            if L < 2:
                continue
            ux, uz = (bx - ax) / L, (bz - az) / L
            nx, nz = -uz, ux
            road_ang = math.atan2(uz, ux)
            for side in (-1, 1):
                t = rnd.uniform(0, 6)
                while t < L:
                    mx, mz = ax + ux * t, az + uz * t
                    dens = sd(mx + nx * side * (hw + 6), mz + nz * side * (hw + 6))
                    dK = math.hypot(mx - kx, mz - kz)
                    zone = "market" if dens > 0.42 and (dK < 1800 or (rd["t"] in ("trunk", "primary") and dens > 0.5)) else "town" if dens > 0.28 else "village"
                    step = {"market": rnd.uniform(3, 7), "town": rnd.uniform(9, 24), "village": rnd.uniform(22, 60)}[zone]
                    if zone == "village" and dens < 0.08:
                        step *= 2.5  # open fields: very little
                    off = hw + (rnd.uniform(0.7, 2.6) if zone == "market" else rnd.uniform(1.0, 4.5))
                    x, z = mx + nx * side * off, mz + nz * side * off
                    t += step
                    if (int(x // OC), int(z // OC)) in occ:
                        continue
                    if any((x - vx) ** 2 + (z - vz) ** 2 < (vr + 12) ** 2 for vx, vz, vr in venues):
                        continue
                    e, _ = ridx.edge_dist(x, z, skip=("path", "track"))
                    if e < 0.5 or ridx.in_median(x, z):
                        continue
                    if zone == "village" and dens < 0.15 and rnd.random() < 0.6:
                        continue
                    typ = rnd.choices(range(8), STREET_W[zone])[0]
                    face = road_ang + (math.pi if side > 0 else 0)  # local +z toward the road
                    if typ in (1, 4):
                        ang = face + rnd.uniform(-0.35, 0.35)          # parked nose-in
                    elif typ in (0, 2, 6):
                        ang = road_ang + (0 if rnd.random() < 0.5 else math.pi) + rnd.uniform(-0.1, 0.1)
                    else:
                        ang = rnd.uniform(-math.pi, math.pi)
                    out.append([typ, int(round(x * 10)), int(round(z * 10)), int(round(ang * 100)), rnd.randrange(8)])
                    # people gather: an extra person or two next to carts and kiosks
                    if typ in (0, 2) and rnd.random() < 0.6:
                        for _ in range(rnd.randint(1, 2)):
                            px, pz = x + rnd.uniform(-1.5, 1.5), z + rnd.uniform(-1.5, 1.5)
                            if (int(px // OC), int(pz // OC)) not in occ and ridx.edge_dist(px, pz, skip=("path", "track"))[0] > 0.3:
                                out.append([3, int(round(px * 10)), int(round(pz * 10)), int(round(rnd.uniform(-3.14, 3.14) * 100)), rnd.randrange(8)])
    return out


def place_trees(roads, sample_density, sample_green, road_clear, occ, OC, venues, extent):
    rnd = random.Random(99)
    trees = []
    def near_venue(x, z):
        return any((x - vx) ** 2 + (z - vz) ** 2 < (vr + 10) ** 2 for vx, vz, vr in venues)
    # rows of poplar/eucalyptus along major roads through farmland
    for rd in roads:
        if rd["t"] not in ("trunk", "primary", "secondary", "tertiary", "unclassified"):
            continue
        p = rd["p"]; hw = rd["w"] / 2
        for i in range(0, len(p) - 2, 2):
            ax, az, bx, bz = p[i], p[i + 1], p[i + 2], p[i + 3]
            L = math.hypot(bx - ax, bz - az)
            if L < 1:
                continue
            ux, uz = (bx - ax) / L, (bz - az) / L
            nx, nz = -uz, ux
            for side in (-1, 1):
                t = rnd.uniform(0, 10)
                while t < L:
                    x = ax + ux * t + nx * side * (hw + rnd.uniform(3, 6))
                    z = az + uz * t + nz * side * (hw + rnd.uniform(3, 6))
                    if sample_density(x, z) < 0.25 and road_clear(x, z, 1.2) and (int(x // OC), int(z // OC)) not in occ and not near_venue(x, z):
                        kind = 0 if rnd.random() < 0.55 else (1 if rnd.random() < 0.6 else 2)
                        trees.append([round(x, 1), round(z, 1), kind, round(rnd.uniform(0.8, 1.25), 2)])
                    t += rnd.uniform(9, 22)
    # scattered trees in green clumps
    x0, z0, x1, z1 = extent
    for _ in range(90000):
        x, z = rnd.uniform(x0, x1), rnd.uniform(z0, z1)
        gval = sample_green(x, z)
        dval = sample_density(x, z)
        if near_venue(x, z):
            continue
        if gval > 0.6 and dval < 0.35 and rnd.random() < (gval - 0.6) * 0.35:
            if road_clear(x, z, 1.5) and (int(x // OC), int(z // OC)) not in occ:
                trees.append([round(x, 1), round(z, 1), 1 if rnd.random() < 0.6 else 2, round(rnd.uniform(0.7, 1.3), 2)])
        elif 0.25 < dval < 0.6 and rnd.random() < 0.04:
            if road_clear(x, z, 1.5) and (int(x // OC), int(z // OC)) not in occ:
                trees.append([round(x, 1), round(z, 1), 1, round(rnd.uniform(0.7, 1.1), 2)])
    return trees


def main():
    els = load_osm()
    roads, graph, nodepos, nodetype = build_roads(els)
    print(f"roads: {len(roads)}  graph nodes: {len(nodepos)}")
    divided_carriageways(roads)
    for r in roads:
        r.pop("lanes", None)

    places = {k: to_local(*v) for k, v in PLACES.items()}
    routes = {}
    # Ch1: Kichha centre -> Darau Chauraha (mithai) -> Azad Nagar -> home
    legs = [("kichha", "darau", 40, 40), ("darau", "azad", 40, 0), ("azad", "home", 0, 0)]
    pts_all, L_all, marks = [], 0, {}
    for a, b, sa, sb in legs:
        pts, L, da, db = route(graph, nodepos, nodetype, places[a], places[b], min_speed_from=sa, min_speed_to=sb)
        if pts_all: pts = pts[1:]
        pts_all += pts; L_all += L
        marks[b] = [round(pts_all[-1][0], 1), round(pts_all[-1][1], 1)]
        print(f"  leg {a}->{b}: {L:.0f} m (snap {da:.0f}/{db:.0f})")
    routes["arrival"] = {"pts": [[round(x, 1), round(z, 1)] for x, z in pts_all], "len": round(L_all), "marks": marks}
    print(f"arrival route {L_all:.0f} m")
    pts, L, da, db = route(graph, nodepos, nodetype, places["home"], places["baraat"])
    routes["baraat"] = {"pts": [[round(x, 1), round(z, 1)] for x, z in pts], "len": round(L)}
    print(f"baraat route {L:.0f} m (snap {da:.0f}/{db:.0f})")
    pts, L, da, db = route(graph, nodepos, nodetype, places["home"], places["reception"])
    routes["reception"] = {"pts": [[round(x, 1), round(z, 1)] for x, z in pts], "len": round(L)}
    print(f"reception route {L:.0f} m (snap {da:.0f}/{db:.0f})")

    img, ox, oz, mpp = build_mosaic()
    density, green, water, fine = built_mask(img, road_raster(roads, img.shape[:2], ox, oz, mpp))
    H, W = density.shape
    print(f"mosaic {W}x{H}  mpp={mpp:.2f}")

    def sampler(arr):
        def f(x, z):
            i = int((z - oz) / mpp); j = int((x - ox) / mpp)
            if 0 <= i < H and 0 <= j < W:
                return float(arr[i, j])
            return 0.0
        return f
    sd, sg, sf = sampler(density), sampler(green), sampler(fine)

    # debug previews (not shipped)
    dbg = os.path.join(ROOT, "data", "debug"); os.makedirs(dbg, exist_ok=True)
    Image.fromarray((np.clip(density * 255 * 1.4, 0, 255)).astype(np.uint8)).save(os.path.join(dbg, "built_density.png"))

    venues = [(*places["home"], 45), (*places["baraat"], 70), (*places["reception"], 80)]

    # real footprints (home neighbours are kept; the home compound clears its own plot at runtime)
    if not os.path.exists(FOOTPRINTS):
        print("downloading building footprints (Overture Maps)...")
        fp.fetch_overture(FOOTPRINTS, BBOX)
    ridx = fp.RoadIndex(roads)
    rings = fp.load_footprints(FOOTPRINTS, to_local, ridx, [(*places["baraat"], 70), (*places["reception"], 80)])
    ts = fp.TileSampler(17, TILE_CACHE, TILE_URL, local_to_merc, R)
    tiles = set()
    for ring in rings:
        for x, z in ring:
            px, py = ts.px(x, z)
            tiles.add((int(px // 256), int(py // 256)))
    ts.prefetch(sorted(tiles))
    rings.sort(key=lambda r: (int(ts.px(*r[0])[1] // 256), int(ts.px(*r[0])[0] // 256)))  # tile-coherent sampling
    real = fp.classify(rings, ridx, sd, sf, places, ts)
    OC = 2.0
    occ0 = set()
    for b in real:
        occ0 |= fp.occ_cells(b[5], OC)

    # procedural infill only where the street frontage has roofs but no traced footprint
    filler, road_clear, occ, OC = place_buildings(roads, sd, venues, occ0=occ0, fine=sf)
    rnd = random.Random(7)
    kx, kz = places["kichha"]
    infill = []
    for (cx, cz, w, d, ang, floors, style, shop) in filler:
        c = obb_corners(cx, cz, w, d, ang)
        ring = [(round(c[1][0], 1), round(c[1][1], 1)), (round(c[0][0], 1), round(c[0][1], 1)),
                (round(c[3][0], 1), round(c[3][1], 1)), (round(c[2][0], 1), round(c[2][1], 1))]
        zone = "market" if math.hypot(cx - kx, cz - kz) < 1700 and sd(cx, cz) > 0.4 else "town"
        infill.append((fp.SHOP if shop else fp.HOUSE, floors, fp.roof_colour(ts, ring), rnd.choices(range(16), fp.PAINT_W[zone])[0], 0, ring))
    buildings = [fp.encode(b) for b in real + infill]
    print(f"buildings: {len(real)} real footprints + {len(infill)} infill")
    s, w, n, e = BBOX
    xa, za = to_local(n, w); xb, zb = to_local(s, e)
    trees = place_trees(roads, sd, sg, road_clear, occ, OC, venues, (xa, za, xb, zb))
    print(f"trees: {len(trees)}")
    street = street_props(roads, sd, ridx, occ, OC, places, venues)
    print(f"street props: {len(street)}")

    # small low-res land-cover map shipped for minimap tint / runtime decisions (derived, not imagery)
    small = Image.fromarray((np.clip(density, 0, 1) * 255).astype(np.uint8)).resize((W // 4, H // 4), Image.BILINEAR)
    small.save(os.path.join(OUT, "built.png"))

    meta = {
        "origin": {"lat": LAT0, "lon": LON0},
        "k": K,
        "bounds": [round(xa), round(za), round(xb), round(zb)],
        "places": {k: [round(v[0], 1), round(v[1], 1)] for k, v in places.items()},
        "builtMap": {"ox": ox, "oz": oz, "mpp": mpp * 4, "w": W // 4, "h": H // 4},
    }
    json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"), indent=1)
    json.dump(roads, open(os.path.join(OUT, "roads.json"), "w"), separators=(",", ":"))
    json.dump(routes, open(os.path.join(OUT, "routes.json"), "w"), separators=(",", ":"))
    json.dump({"v": 2, "b": buildings}, open(os.path.join(OUT, "buildings.json"), "w"), separators=(",", ":"))
    json.dump(trees, open(os.path.join(OUT, "trees.json"), "w"), separators=(",", ":"))
    json.dump(street, open(os.path.join(OUT, "street.json"), "w"), separators=(",", ":"))
    for f in ("meta.json", "roads.json", "routes.json", "buildings.json", "trees.json", "street.json", "built.png"):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")


if __name__ == "__main__":
    main()
