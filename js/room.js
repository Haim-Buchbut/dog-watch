// Random room generator. All units are metres; origin is the top-left inner corner of the room.
import { mulberry32, makeRng, hashSeed } from './rng.js';
import { buildGrid, cellOf, cellCenter, reachable, isFree, DOG_R } from './nav.js';

export const SPECS = {
  bed: { label: 'Bunk bed', len: 2.0, dep: 0.9 },
  closet: { label: 'Closet', len: 1.0, dep: 0.6 },
  fridge: { label: 'Mini fridge', len: 0.55, dep: 0.55 },
  table: { label: 'Table', len: 1.2, dep: 0.75 },
  chair: { label: 'Chair', len: 0.45, dep: 0.45 },
  kitbag: { label: 'Kitbag', len: 0.9, dep: 0.42 },
  smallbag: { label: 'Small bag', len: 0.45, dep: 0.3 },
};

const BED_COUNT_WEIGHTS = [[0, 3], [1, 6], [2, 25], [3, 30], [4, 25], [5, 7], [6, 4]];
const SMALL_BAG_COLORS = ['#2f3b52', '#1d1d1f', '#8e2b2b', '#3f5f3a', '#5b4a7a', '#7a5b2e'];
const KITBAG_COLORS = ['#5d6b3a', '#4d5a31', '#6b6a45', '#3c4a5c', '#2e2e2e'];
const DOOR_W = 0.9;

function overlaps(a, b, gap = 0) {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function inside(room, r) {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= room.w + 1e-9 && r.y + r.h <= room.h + 1e-9;
}

function fits(room, r, gap) {
  if (!inside(room, r)) return false;
  if (overlaps(r, room.doorZone)) return false;
  return room.objects.every((o) => !overlaps(r, o, gap));
}

function wallRect(room, side, s, len, dep) {
  if (side === 0) return { x: s, y: 0, w: len, h: dep };
  if (side === 2) return { x: s, y: room.h - dep, w: len, h: dep };
  if (side === 3) return { x: 0, y: s, w: dep, h: len };
  return { x: room.w - dep, y: s, w: dep, h: len };
}

function placeOnWall(room, rng, len, dep, { corner = false, gap = 0.06 } = {}) {
  for (let t = 0; t < 400; t++) {
    const side = rng.weighted([[0, room.w], [1, room.h], [2, room.w], [3, room.h]]);
    const wallLen = side % 2 === 0 ? room.w : room.h;
    if (len > wallLen) continue;
    let s = corner ? (rng.chance(0.5) ? 0 : wallLen - len) : rng.range(0, wallLen - len);
    s = Math.round(s * 20) / 20;
    const r = wallRect(room, side, Math.min(s, wallLen - len), len, dep);
    if (fits(room, r, gap)) return { ...r, side };
  }
  return null;
}

function placeOnFloor(room, rng, len, dep, { near = null, radius = 1.4, rot = null, gap = 0.05 } = {}) {
  for (let t = 0; t < 400; t++) {
    const a = rot ?? rng.range(0, Math.PI);
    const w = Math.abs(len * Math.cos(a)) + Math.abs(dep * Math.sin(a));
    const h = Math.abs(len * Math.sin(a)) + Math.abs(dep * Math.cos(a));
    let cx, cy;
    if (near && t < 250) {
      cx = near.x + near.w / 2 + rng.range(-1, 1) * (near.w / 2 + radius);
      cy = near.y + near.h / 2 + rng.range(-1, 1) * (near.h / 2 + radius);
    } else {
      cx = rng.range(w / 2, room.w - w / 2);
      cy = rng.range(h / 2, room.h - h / 2);
    }
    const r = { x: cx - w / 2, y: cy - h / 2, w, h };
    if (fits(room, r, gap)) return { ...r, rot: a, len, dep };
  }
  return null;
}

function counts(rng) {
  const beds = rng.weighted(BED_COUNT_WEIGHTS);
  const people = beds === 0 ? rng.int(1, 3) : Math.max(1, beds * 2 - (rng.chance(0.35) ? 1 : 0));
  const closets = beds === 0 ? rng.int(1, 2) : Math.max(1, beds + rng.int(-1, 1));
  const chairs = rng.int(1, 2);
  const smallBags = [];
  for (let p = 0; p < people; p++) if (rng.chance(0.4)) smallBags.push(rng.int(1, 2));
  return { beds, people, closets, chairs, smallBags: smallBags.reduce((s, n) => s + n, 0) };
}

function tryBuild(rng, c, grow) {
  const bedMode = rng.chance(0.5) ? 'head' : 'along'; // head-to-wall or long side against wall
  const bedWall = bedMode === 'head' ? SPECS.bed.dep : SPECS.bed.len;
  const needed = c.beds * bedWall * 1.15 + c.closets * 1.1 + 0.6 + 2.0;
  let w = rng.range(5, 8);
  let h = rng.range(4, 6.2);
  while (2 * (w + h) - 3.6 < needed * 1.3) {
    w += 0.4;
    h += 0.25;
  }
  w = Math.round((w + grow * 0.4) * 10) / 10;
  h = Math.round((h + grow * 0.3) * 10) / 10;

  const room = { w, h, objects: [], bedMode };

  // Door
  const doorSide = rng.int(0, 3);
  const doorWall = doorSide % 2 === 0 ? w : h;
  const doorS = Math.round(rng.range(0.3, doorWall - DOOR_W - 0.3) * 20) / 20;
  room.door = { side: doorSide, s: doorS, w: DOOR_W };
  const zone = wallRect(room, doorSide, doorS - 0.15, DOOR_W + 0.3, 1.1);
  room.doorZone = zone;
  const inward = [[0, 1], [-1, 0], [0, -1], [1, 0]][doorSide];
  const doorMid = doorSide % 2 === 0
    ? { x: doorS + DOOR_W / 2, y: doorSide === 0 ? 0 : h }
    : { x: doorSide === 3 ? 0 : w, y: doorS + DOOR_W / 2 };
  room.start = { x: doorMid.x + inward[0] * 0.55, y: doorMid.y + inward[1] * 0.55 };
  room.startHeading = Math.atan2(inward[1], inward[0]);

  const add = (type, r, extra = {}) => {
    const n = room.objects.filter((o) => o.type === type).length + 1;
    room.objects.push({ id: room.objects.length, type, label: `${SPECS[type].label} ${n}`, ...r, ...extra });
  };

  for (let i = 0; i < c.beds; i++) {
    const len = bedMode === 'head' ? SPECS.bed.dep : SPECS.bed.len;
    const dep = bedMode === 'head' ? SPECS.bed.len : SPECS.bed.dep;
    const r = placeOnWall(room, rng, len, dep, { gap: 0.08 });
    if (!r) return null;
    add('bed', r, { pillowEnd: rng.chance(0.5) ? 0 : 1 });
  }
  for (let i = 0; i < c.closets; i++) {
    const r = placeOnWall(room, rng, SPECS.closet.len, SPECS.closet.dep, { gap: 0.02 });
    if (!r) return null;
    add('closet', r);
  }
  const fridge = placeOnWall(room, rng, SPECS.fridge.len, SPECS.fridge.dep, { corner: rng.chance(0.6) });
  if (!fridge) return null;
  add('fridge', fridge);

  const tRot = rng.chance(0.5) ? 0 : Math.PI / 2;
  const table = rng.chance(0.5)
    ? placeOnWall(room, rng, SPECS.table.len, SPECS.table.dep, { gap: 0.6 })
    : placeOnFloor(room, rng, SPECS.table.len, SPECS.table.dep, { rot: tRot, gap: 0.65 });
  if (!table) return null;
  add('table', { x: table.x, y: table.y, w: table.w, h: table.h });
  const t = room.objects[room.objects.length - 1];

  for (let i = 0; i < c.chairs; i++) {
    const s = SPECS.chair.len;
    const spots = rng.shuffle([
      { x: t.x + t.w / 2 - s / 2 + rng.range(-0.25, 0.25) * (t.w > t.h ? 1 : 0), y: t.y - s - 0.04, face: 1 },
      { x: t.x + t.w / 2 - s / 2 + rng.range(-0.25, 0.25) * (t.w > t.h ? 1 : 0), y: t.y + t.h + 0.04, face: 3 },
      { x: t.x - s - 0.04, y: t.y + t.h / 2 - s / 2 + rng.range(-0.25, 0.25) * (t.h > t.w ? 1 : 0), face: 0 },
      { x: t.x + t.w + 0.04, y: t.y + t.h / 2 - s / 2 + rng.range(-0.25, 0.25) * (t.h > t.w ? 1 : 0), face: 2 },
    ]);
    let placed = false;
    for (const sp of spots) {
      const r = { x: sp.x, y: sp.y, w: s, h: s };
      if (fits(room, r, 0.02)) {
        add('chair', r, { face: sp.face });
        placed = true;
        break;
      }
    }
    if (!placed) {
      const r = placeOnFloor(room, rng, s, s, { rot: 0 });
      if (!r) return null;
      add('chair', { x: r.x, y: r.y, w: r.w, h: r.h }, { face: rng.int(0, 3) });
    }
  }

  const beds = room.objects.filter((o) => o.type === 'bed');
  for (let i = 0; i < c.people; i++) {
    const near = beds.length && rng.chance(0.6) ? rng.pick(beds) : null;
    const r = placeOnFloor(room, rng, SPECS.kitbag.len, SPECS.kitbag.dep, { near });
    if (!r) return null;
    add('kitbag', r, { color: rng.pick(KITBAG_COLORS) });
  }
  for (let i = 0; i < c.smallBags; i++) {
    const anchors = room.objects.filter((o) => o.type === 'kitbag' || o.type === 'bed');
    const near = anchors.length && rng.chance(0.5) ? rng.pick(anchors) : null;
    const r = placeOnFloor(room, rng, SPECS.smallbag.len, SPECS.smallbag.dep, { near, radius: 0.8 });
    if (!r) return null;
    add('smallbag', r, { color: rng.pick(SMALL_BAG_COLORS) });
  }

  // Navigation: every object must be reachable by the dog from the door.
  room.grid = buildGrid(room);
  const startCell = cellOf(room.grid, room.start.x, room.start.y);
  if (room.grid.blocked[startCell]) return null;
  room.reach = reachable(room.grid, startCell);
  for (const o of room.objects) {
    o.approaches = approachPoints(room, o);
    if (!o.approaches.length) return null;
  }
  room.freeCells = [];
  for (let i = 0; i < room.reach.length; i++) if (room.reach[i]) room.freeCells.push(i);
  return room;
}

// Spots just outside an object's edges where the dog can stand and sniff it.
function approachPoints(room, o) {
  const off = DOG_R + 0.12;
  const pts = [];
  const along = (len) => (len > 1.3 ? [0.2, 0.5, 0.8] : len > 0.7 ? [0.3, 0.7] : [0.5]);
  for (const f of along(o.w)) {
    pts.push({ x: o.x + o.w * f, y: o.y - off }, { x: o.x + o.w * f, y: o.y + o.h + off });
  }
  for (const f of along(o.h)) {
    pts.push({ x: o.x - off, y: o.y + o.h * f }, { x: o.x + o.w + off, y: o.y + o.h * f });
  }
  return pts.filter((p) => isFree(room.grid, p.x, p.y) && room.reach[cellOf(room.grid, p.x, p.y)]);
}

export function generateRoom(seedStr) {
  const rng = makeRng(mulberry32(hashSeed(String(seedStr))));
  const c = counts(rng);
  for (let attempt = 0; attempt < 40; attempt++) {
    const room = tryBuild(rng, c, Math.floor(attempt / 4));
    if (room) {
      room.seed = String(seedStr);
      room.counts = c;
      return room;
    }
  }
  // Extremely crowded draw: fall back to a related seed rather than failing.
  const fallback = generateRoom(`${seedStr}~`);
  fallback.seed = String(seedStr);
  return fallback;
}

export function randomFreePoint(room, rand = Math.random) {
  const i = room.freeCells[Math.floor(rand() * room.freeCells.length)];
  return cellCenter(room.grid, i);
}

export function describeRoom(room) {
  const c = room.counts;
  const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
  return [
    `${room.w.toFixed(1)} × ${room.h.toFixed(1)} m`,
    plural(c.beds, 'bunk bed'),
    plural(c.people, 'person').replace('persons', 'people'),
    plural(c.closets, 'closet'),
    plural(c.people, 'kitbag'),
    plural(c.smallBags, 'small bag'),
    plural(c.chairs, 'chair'),
  ].join(' · ');
}
