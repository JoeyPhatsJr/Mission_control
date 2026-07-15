// Regenerates the WORLD_LAND coastline constant embedded in ../index.html (pad locator map).
// 1. Fetch source:  curl -sL "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson" -o land.geojson
// 2. Run:           node simplify-coastline.js   (writes world_land.js)
// 3. Paste the `const WORLD_LAND=[...]` from world_land.js over the existing one in index.html.
const fs = require('fs');
const dir = __dirname + '/';
const gj = JSON.parse(fs.readFileSync(dir + 'land.geojson', 'utf8'));

// perpendicular-distance Douglas-Peucker on [lon,lat] rings
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const d = Math.abs((px - ax) * dy - (py - ay) * dx) / len;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}
function simplifyRing(ring, eps) {   // RDP for CLOSED rings: split at farthest point so endpoints aren't degenerate
  let r = ring.slice();
  if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop();
  if (r.length < 4) return null;
  let far = 0, fd = -1;
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = rdp(r.slice(0, far + 1), eps), b = rdp(r.slice(far), eps);
  let out = a.slice(0, -1).concat(b);
  out.push(out[0]);   // reclose
  return out.length >= 4 ? out : null;
}
function ringArea(pts) { // shoelace, absolute, in deg^2
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  return Math.abs(a / 2);
}

const EPS = 0.7;        // simplification tolerance in degrees
const MIN_AREA = 6;     // drop islands smaller than this (deg^2) — removes clutter
const rings = [];
for (const f of gj.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of polys) {
    const outer = poly[0];                        // outer ring only (ignore holes at this scale)
    if (ringArea(outer) < MIN_AREA) continue;
    const simp = simplifyRing(outer, EPS);
    if (!simp) continue;
    const s = simp.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    if (s.length >= 4) rings.push(s);
  }
}
rings.sort((a, b) => ringArea(b) - ringArea(a));
const out = 'const WORLD_LAND=' + JSON.stringify(rings) + ';';
fs.writeFileSync(dir + 'world_land.js', out);
console.log('rings:', rings.length, 'points:', rings.reduce((n, r) => n + r.length, 0), 'bytes:', out.length);
