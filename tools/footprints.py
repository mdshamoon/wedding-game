"""Real building footprints -> game buildings.

Source: Overture Maps buildings (Google Open Buildings + Microsoft ML footprints + OpenStreetMap),
traced from satellite imagery, so houses stand where they really are. Footprints carry no heights
here, so floors are estimated from the neighbourhood (bazaar / town / village) and footprint size.
Roof colours are sampled from the satellite imagery inside each footprint.
"""
import csv, math, os, random, concurrent.futures as cf, urllib.request
from collections import OrderedDict
import numpy as np
from PIL import Image

csv.field_size_limit(10 ** 9)

HOUSE, SHOP, SHED, BRICK = 0, 1, 2, 3
MAJOR = ("trunk", "primary", "secondary", "tertiary")
NO_FRONT = ("path", "track")

# Paint palette indices (must match PAINTS in src/world/buildings.js).
#  0 off-white  1 cream  2 cement grey  3 light grey  4 pale yellow  5 ochre  6 salmon  7 light pink
#  8 sky blue   9 pistachio 10 mint 11 peach 12 lavender 13 terracotta 14 dusty white 15 leaf green
PAINT_W = {
    "market": [10, 9, 14, 10, 6, 4, 4, 3, 4, 3, 2, 3, 1, 2, 8, 2],
    "town":   [9, 9, 8, 7, 7, 4, 5, 5, 6, 5, 4, 5, 2, 2, 7, 3],
    "village": [7, 8, 6, 4, 8, 4, 7, 7, 7, 6, 5, 6, 3, 2, 6, 4],
}
FLOORS_W = {"market": [8, 35, 40, 17], "town": [25, 50, 22, 3], "village": [55, 40, 5, 0]}


def fetch_overture(path, bbox, release="2026-10-21.0"):
    """Download footprints inside bbox (s, w, n, e) to CSV with DuckDB (anonymous S3)."""
    import duckdb
    s, w, n, e = bbox
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
    con.execute(f"""
      COPY (SELECT id, sources[1].dataset AS src, ST_AsText(geometry) AS wkt
            FROM read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=buildings/type=building/*', hive_partitioning=1)
            WHERE bbox.xmin > {w} AND bbox.xmax < {e} AND bbox.ymin > {s} AND bbox.ymax < {n})
      TO '{path}' (HEADER, DELIMITER ',');""")


def _ring(txt):
    return [tuple(map(float, p.strip().split()[:2])) for p in txt.split(",")]


def parse_wkt(w):
    """Outer ring (lon, lat) of a POLYGON, or of the largest part of a MULTIPOLYGON."""
    if w.startswith("POLYGON"):
        body = w[w.index("((") + 2:]
        return _ring(body[:body.index(")")])
    if w.startswith("MULTIPOLYGON"):
        best, ba = None, 0
        for part in w[w.index("(((") + 3:].split(")), (("):
            r = _ring(part.split(")")[0].replace("(", ""))
            a = abs(signed_area(r))
            if a > ba:
                best, ba = r, a
        return best
    return None


def signed_area(r):
    s = 0.0
    for i in range(len(r)):
        x1, z1 = r[i]; x2, z2 = r[(i + 1) % len(r)]
        s += x1 * z2 - x2 * z1
    return s / 2


def _dp(pts, eps):
    if len(pts) < 3:
        return pts
    (ax, az), (bx, bz) = pts[0], pts[-1]
    L = math.hypot(bx - ax, bz - az) or 1e-9
    best, bi = 0, 0
    for i in range(1, len(pts) - 1):
        d = abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / L
        if d > best:
            best, bi = d, i
    if best > eps:
        return _dp(pts[:bi + 1], eps)[:-1] + _dp(pts[bi:], eps)
    return [pts[0], pts[-1]]


def simplify(ring, eps=0.35):
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring = ring[:-1]
    if len(ring) <= 4:
        return ring
    # split at the farthest vertex from vertex 0 so the closed ring simplifies cleanly
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - ring[0][0]) ** 2 + (ring[i][1] - ring[0][1]) ** 2)
    a = _dp(ring[:far + 1], eps)
    b = _dp(ring[far:] + [ring[0]], eps)
    out = a[:-1] + b[:-1]
    return out if len(out) >= 3 else ring


def point_in(r, x, z):
    inside = False
    j = len(r) - 1
    for i in range(len(r)):
        xi, zi = r[i]; xj, zj = r[j]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def centroid(r):
    a = signed_area(r)
    if abs(a) < 1e-6:
        return sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)
    cx = cz = 0.0
    for i in range(len(r)):
        x1, z1 = r[i]; x2, z2 = r[(i + 1) % len(r)]
        f = x1 * z2 - x2 * z1
        cx += (x1 + x2) * f; cz += (z1 + z2) * f
    return cx / (6 * a), cz / (6 * a)


class RoadIndex:
    """Grid of road segments for clearance / frontage queries."""
    def __init__(self, roads, cell=25.0):
        self.c, self.g = cell, {}
        for rd in roads:
            p, hw, t, m = rd["p"], rd["w"] / 2, rd["t"], rd.get("m", 0)
            for i in range(0, len(p) - 2, 2):
                s = (p[i], p[i + 1], p[i + 2], p[i + 3], hw, t, m)
                for gi in range(int((min(s[0], s[2]) - hw) // cell) - 1, int((max(s[0], s[2]) + hw) // cell) + 2):
                    for gj in range(int((min(s[1], s[3]) - hw) // cell) - 1, int((max(s[1], s[3]) + hw) // cell) + 2):
                        self.g.setdefault((gi, gj), []).append(s)

    def near(self, x, z):
        return self.g.get((int(x // self.c), int(z // self.c)), ())

    @staticmethod
    def proj(x, z, s):
        ax, az, bx, bz = s[0], s[1], s[2], s[3]
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz or 1e-9
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L2))
        qx, qz = ax + dx * t, az + dz * t
        return qx, qz, math.hypot(x - qx, z - qz)

    def in_median(self, x, z):
        """True if (x,z) lies on the median side of a divided carriageway, within the median."""
        for s in self.near(x, z):
            m = s[6]
            if not m:
                continue
            ax, az, bx, bz = s[0], s[1], s[2], s[3]
            L = math.hypot(bx - ax, bz - az) or 1e-9
            nx, nz = -(bz - az) / L, (bx - ax) / L
            qx, qz, d = self.proj(x, z, s)
            side = (x - qx) * nx + (z - qz) * nz
            if side * m > 0 and d < s[4] + abs(m) * 2 + 1.5:
                return True
        return False

    def edge_dist(self, x, z, skip=()):
        """Distance from (x,z) to the nearest road *edge* (negative = on the carriageway)."""
        best, bs = 1e9, None
        for s in self.near(x, z):
            if s[5] in skip:
                continue
            _, _, d = self.proj(x, z, s)
            if d - s[4] < best:
                best, bs = d - s[4], s
        return best, bs


class TileSampler:
    """Reads satellite pixels at zoom z for local coordinates, fetching + caching tiles."""
    def __init__(self, z, cache_dir, url, local_to_merc, R):
        self.z, self.dir, self.url, self.l2m, self.R = z, cache_dir, url, local_to_merc, R
        self.lru = OrderedDict()

    def px(self, x, z):
        mx, my = self.l2m(x, z)
        n = 256 * 2 ** self.z
        return (mx + math.pi * self.R) / (2 * math.pi * self.R) * n, (math.pi * self.R - my) / (2 * math.pi * self.R) * n

    def path(self, tx, ty):
        return os.path.join(self.dir, f"{self.z}_{tx}_{ty}.jpg")

    def fetch(self, tx, ty):
        p = self.path(tx, ty)
        if not os.path.exists(p):
            req = urllib.request.Request(self.url.format(z=self.z, x=tx, y=ty), headers={"User-Agent": "wedding-game-data/0.1"})
            with urllib.request.urlopen(req, timeout=30) as r:
                open(p, "wb").write(r.read())

    def prefetch(self, tiles):
        todo = [t for t in tiles if not os.path.exists(self.path(*t))]
        print(f"  roof-colour tiles z{self.z}: {len(tiles)} ({len(todo)} to download)")
        with cf.ThreadPoolExecutor(8) as ex:
            list(ex.map(lambda t: self.fetch(*t), todo))

    def tile(self, tx, ty):
        k = (tx, ty)
        a = self.lru.get(k)
        if a is None:
            try:
                a = np.asarray(Image.open(self.path(tx, ty)).convert("RGB"))
            except Exception:
                a = np.zeros((256, 256, 3), np.uint8)
            self.lru[k] = a
            if len(self.lru) > 96:
                self.lru.popitem(last=False)
        else:
            self.lru.move_to_end(k)
        return a

    def sample(self, px, py):
        tx, ty = int(px // 256), int(py // 256)
        return self.tile(tx, ty)[int(py) % 256, int(px) % 256]


def roof_colour(ts, ring):
    """Median satellite colour inside the footprint, shrunk toward the centre to avoid edges/shadows."""
    cx, cz = centroid(ring)
    shr = [(cx + (x - cx) * 0.7, cz + (z - cz) * 0.7) for x, z in ring]
    xs = [p[0] for p in shr]; zs = [p[1] for p in shr]
    step = 1.0
    vals = []
    x = min(xs)
    while x <= max(xs):
        z = min(zs)
        while z <= max(zs):
            if point_in(shr, x, z):
                vals.append(ts.sample(*ts.px(x, z)))
            z += step
        x += step
    if not vals:
        vals = [ts.sample(*ts.px(cx, cz))]
    v = np.median(np.array(vals, dtype=np.float32), axis=0)
    return (int(v[0]) << 16) | (int(v[1]) << 8) | int(v[2])


def occ_cells(ring, OC):
    xs = [p[0] for p in ring]; zs = [p[1] for p in ring]
    cells = {(int(x // OC), int(z // OC)) for x, z in ring}
    for i in range(int(min(xs) // OC), int(max(xs) // OC) + 1):
        for j in range(int(min(zs) // OC), int(max(zs) // OC) + 1):
            if point_in(ring, (i + 0.5) * OC, (j + 0.5) * OC):
                cells.add((i, j))
    return cells


def load_footprints(path, to_local, roads_idx, drop_zones):
    """Parse, project, simplify, orient and clear footprints off the road surfaces."""
    out = []
    dropped = {"road": 0, "venue": 0, "tiny": 0}
    for row in csv.DictReader(open(path)):
        ll = parse_wkt(row["wkt"])
        if not ll or len(ll) < 4:
            continue
        ring = simplify([to_local(lat, lon) for lon, lat in ll])
        if len(ring) < 3:
            continue
        a = signed_area(ring)
        if abs(a) < 9:
            dropped["tiny"] += 1
            continue
        if a > 0:  # walls face outward on the left-hand normal: we need negative shoelace area
            ring = ring[::-1]
        cx, cz = centroid(ring)
        if any((cx - vx) ** 2 + (cz - vz) ** 2 < vr * vr for vx, vz, vr in drop_zones):
            dropped["venue"] += 1
            continue
        d, _ = roads_idx.edge_dist(cx, cz, skip=NO_FRONT)
        if d < 1.0:
            dropped["road"] += 1
            continue
        # push any vertex that pokes onto a carriageway back to the kerb
        fixed = []
        for x, z in ring:
            for s in roads_idx.near(x, z):
                if s[5] in NO_FRONT:
                    continue
                qx, qz, dd = RoadIndex.proj(x, z, s)
                if dd < s[4] + 0.4:
                    k = (s[4] + 0.4) / (dd or 1e-6)
                    x, z = qx + (x - qx) * k, qz + (z - qz) * k
            fixed.append((round(x, 1), round(z, 1)))
        if abs(signed_area(fixed)) < 0.5 * abs(a):
            dropped["road"] += 1
            continue
        # a wall that cuts across a carriageway (both corners outside it) means the outline and the
        # mapped road disagree: drop the building so the road stays drivable
        crosses = False
        for k in range(len(fixed)):
            (x1, z1), (x2, z2) = fixed[k], fixed[(k + 1) % len(fixed)]
            L = math.hypot(x2 - x1, z2 - z1)
            for j in range(1, int(L) + 1):
                t = j / (int(L) + 1)
                e, _ = roads_idx.edge_dist(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, skip=NO_FRONT)
                if e < -0.3:
                    crosses = True
                    break
            if crosses:
                break
        if crosses:
            dropped["road"] += 1
            continue
        out.append(fixed)
    print(f"  footprints kept {len(out)}  dropped {dropped}")
    return out


def front_edge(ring, roads_idx):
    """Index of the wall that faces the street (outward normal toward a nearby road), or -1."""
    best, bi, bt = 1e9, -1, None
    n = len(ring)
    for i in range(n):
        (x1, z1), (x2, z2) = ring[i], ring[(i + 1) % n]
        L = math.hypot(x2 - x1, z2 - z1)
        if L < 2.8:
            continue
        nx, nz = -(z2 - z1) / L, (x2 - x1) / L
        mx, mz = (x1 + x2) / 2, (z1 + z2) / 2
        for s in roads_idx.near(mx, mz):
            if s[5] in NO_FRONT:
                continue
            qx, qz, d = RoadIndex.proj(mx, mz, s)
            e = d - s[4]
            if e > 9 or d < 1e-3:
                continue
            if ((qx - mx) * nx + (qz - mz) * nz) / d < 0.55:
                continue
            if e < best:
                best, bi, bt = e, i, s[5]
    return bi, best, bt


def classify(rings, roads_idx, sd, fine, places, ts, seed=2027):
    rnd = random.Random(seed)
    kx, kz = places["kichha"]
    out = []
    stats = {"market": 0, "town": 0, "village": 0, "shop": 0, "shed": 0, "brick": 0}
    for ring in rings:
        cx, cz = centroid(ring)
        area = abs(signed_area(ring))
        dens = sd(cx, cz)
        dK = math.hypot(cx - kx, cz - kz)
        fi, fdist, ftype = front_edge(ring, roads_idx)
        on_major = fi >= 0 and ftype in MAJOR and fdist < 8
        if (on_major and dens > 0.35 and dK < 1700) or (dK < 650 and dens > 0.4):
            zone = "market"
        elif dK < 2600 and dens > 0.33:
            zone = "town"
        else:
            zone = "village"
        stats[zone] += 1
        rgb = roof_colour(ts, ring)
        r, g, b = rgb >> 16, (rgb >> 8) & 255, rgb & 255
        tin = (b > r + 18 and b >= g - 6) or (g > r + 22 and b > r + 10)  # blue/teal sheet roofs
        kind = HOUSE
        floors = rnd.choices([1, 2, 3, 4], FLOORS_W[zone])[0]
        if area < 22:
            floors = min(floors, 1 + (zone == "market"))
        if math.hypot(cx - places["home"][0], cz - places["home"][1]) < 80:
            floors = min(floors, 2)  # low village houses around home; keeps the cutscene orbits clear
        elif area > 160 and zone != "village" and rnd.random() < 0.35:
            floors = min(4, floors + 1)
        if area > 1400 or (area > 260 and (tin or (zone != "market" and dens < 0.42 and rnd.random() < 0.7))):
            kind, floors = SHED, 1
        elif fi >= 0 and fdist < 8 and ftype not in ("service",):
            p = 0.85 if zone == "market" else 0.6 if (on_major and dens > 0.28) else 0.2 if dens > 0.5 else 0.04
            if rnd.random() < p:
                kind = SHOP
        if kind == HOUSE and rnd.random() < {"market": 0.04, "town": 0.08, "village": 0.18}[zone]:
            kind = BRICK
        stats["shop"] += kind == SHOP; stats["shed"] += kind == SHED; stats["brick"] += kind == BRICK
        paint = rnd.choices(range(16), PAINT_W[zone])[0]
        out.append((kind, floors, rgb, paint, fi, ring))
    print(f"  zones/kinds {stats}")
    return out


def encode(b):
    kind, floors, rgb, paint, fi, ring = b
    x0, z0 = int(round(ring[0][0] * 10)), int(round(ring[0][1] * 10))
    flat = [kind, floors, rgb, paint, fi, x0, z0]
    px, pz = x0, z0
    for x, z in ring[1:]:
        ix, iz = int(round(x * 10)), int(round(z * 10))
        flat += [ix - px, iz - pz]
        px, pz = ix, iz
    return flat
