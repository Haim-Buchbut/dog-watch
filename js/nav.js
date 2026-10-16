// Occupancy grid + A* pathfinding so the dog walks around furniture, not through it.

export const CELL = 0.1; // metres
export const DOG_R = 0.2; // clearance the dog needs from furniture/walls

export function buildGrid(room) {
  const cols = Math.round(room.w / CELL);
  const rows = Math.round(room.h / CELL);
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * CELL;
      const y = (r + 0.5) * CELL;
      if (x < DOG_R || y < DOG_R || x > room.w - DOG_R || y > room.h - DOG_R) {
        blocked[r * cols + c] = 1;
        continue;
      }
      for (const o of room.objects) {
        if (x > o.x - DOG_R && x < o.x + o.w + DOG_R && y > o.y - DOG_R && y < o.y + o.h + DOG_R) {
          blocked[r * cols + c] = 1;
          break;
        }
      }
    }
  }
  return { cols, rows, blocked };
}

export function cellOf(grid, x, y) {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor(x / CELL)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / CELL)));
  return r * grid.cols + c;
}

export function cellCenter(grid, i) {
  return { x: ((i % grid.cols) + 0.5) * CELL, y: (Math.floor(i / grid.cols) + 0.5) * CELL };
}

export function isFree(grid, x, y) {
  if (x < 0 || y < 0) return false;
  const c = Math.floor(x / CELL);
  const r = Math.floor(y / CELL);
  if (c >= grid.cols || r >= grid.rows) return false;
  return !grid.blocked[r * grid.cols + c];
}

// Flood fill from a start cell; returns a Uint8Array mask of reachable cells.
export function reachable(grid, start) {
  const mask = new Uint8Array(grid.cols * grid.rows);
  if (grid.blocked[start]) return mask;
  const queue = [start];
  mask[start] = 1;
  while (queue.length) {
    const i = queue.pop();
    const c = i % grid.cols;
    const r = (i - c) / grid.cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
      const n = nr * grid.cols + nc;
      if (!mask[n] && !grid.blocked[n]) {
        mask[n] = 1;
        queue.push(n);
      }
    }
  }
  return mask;
}

function lineFree(grid, a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.ceil(d / (CELL * 0.5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!isFree(grid, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

// A* over 8-connected grid, then string-pulled into a short list of waypoints.
export function findPath(grid, from, to) {
  const start = cellOf(grid, from.x, from.y);
  const goal = cellOf(grid, to.x, to.y);
  if (grid.blocked[goal]) return null;
  const n = grid.cols * grid.rows;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const open = [start];
  const f = new Float32Array(n).fill(Infinity);
  const gc = goal % grid.cols;
  const gr = Math.floor(goal / grid.cols);
  const h = (i) => {
    const dc = Math.abs((i % grid.cols) - gc);
    const dr = Math.abs(Math.floor(i / grid.cols) - gr);
    return Math.max(dc, dr) + 0.414 * Math.min(dc, dr);
  };
  g[start] = 0;
  f[start] = h(start);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[bi]]) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const c = cur % grid.cols;
    const r = (cur - c) / grid.cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= grid.cols || nr >= grid.rows) continue;
        const ni = nr * grid.cols + nc;
        if (grid.blocked[ni] || closed[ni]) continue;
        if (dc && dr && (grid.blocked[r * grid.cols + nc] || grid.blocked[nr * grid.cols + c])) continue;
        const ng = g[cur] + (dc && dr ? 1.414 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          f[ni] = ng + h(ni);
          came[ni] = cur;
          open.push(ni);
        }
      }
    }
  }
  if (start !== goal && came[goal] === -1) return null;

  const cells = [];
  for (let i = goal; i !== -1; i = came[i]) {
    cells.push(i);
    if (i === start) break;
  }
  cells.reverse();
  const pts = cells.map((i) => cellCenter(grid, i));
  pts[0] = { x: from.x, y: from.y };
  pts[pts.length - 1] = { x: to.x, y: to.y };

  const out = [pts[0]];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (!lineFree(grid, pts[anchor], pts[i])) {
      out.push(pts[i - 1]);
      anchor = i - 1;
    }
  }
  if (pts.length > 1) out.push(pts[pts.length - 1]);
  return out;
}
