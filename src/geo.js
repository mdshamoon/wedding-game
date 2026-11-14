// Local coordinate system shared with tools/build_data.py:
// Web-Mercator metres scaled by cos(lat0), origin = Home pin, +x east, +z south.
const R = 6378137;
const LAT0 = 28.904844, LON0 = 79.473051;
export const K = Math.cos(LAT0 * Math.PI / 180);
const merc = (lat, lon) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
const [MX0, MY0] = merc(LAT0, LON0);

export function toLocal(lat, lon) {
  const [mx, my] = merc(lat, lon);
  return [(mx - MX0) * K, -(my - MY0) * K];
}

export function toLatLon(x, z) {
  const mx = x / K + MX0, my = -z / K + MY0;
  return [(2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180 / Math.PI, mx / R * 180 / Math.PI];
}

// Slippy-map tile bounds in local metres.
export function tileBounds(z, tx, ty) {
  const size = 2 * Math.PI * R / 2 ** z;
  const mxL = tx * size - Math.PI * R;
  const myT = Math.PI * R - ty * size;
  const x0 = (mxL - MX0) * K, z0 = -(myT - MY0) * K;
  const s = size * K;
  return { x0, z0, x1: x0 + s, z1: z0 + s, size: s };
}

export function localToTile(x, z, zoom) {
  const size = 2 * Math.PI * R / 2 ** zoom;
  const mx = x / K + MX0, my = -z / K + MY0;
  return [(mx + Math.PI * R) / size, (Math.PI * R - my) / size];
}
