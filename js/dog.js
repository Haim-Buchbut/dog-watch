// The sniffer dog: a small state machine that wanders between objects, holds near them, and roams.
import { makeRng } from './rng.js';
import { findPath } from './nav.js';
import { randomFreePoint } from './room.js';

const DIST_FALLOFF = 2.4; // metres; smaller = stronger preference for nearby objects
const TURN_RATE = 7; // rad/s

export class Dog {
  constructor(room, rand = Math.random) {
    this.room = room;
    this.rng = makeRng(rand);
    this.onEvent = () => {};
    this.reset();
  }

  reset() {
    const { room } = this;
    this.x = room.start.x;
    this.y = room.start.y;
    this.heading = room.startHeading;
    this.state = 'idle';
    this.path = null;
    this.target = null;
    this.timer = 0;
    this.speed = 1.1;
    this.visits = new Map(); // object id -> count
    this.recent = [];
    this.trail = [{ x: this.x, y: this.y }];
    this.trailClock = 0;
    this.ignored = new Set();
    this.sniffCount = 0;
  }

  start(now = 0) {
    this.reset();
    this.now = now;
    // In ~70% of searches the dog never gets to some of the objects.
    if (this.rng.chance(0.65)) {
      const objs = this.rng.shuffle(this.room.objects);
      const n = Math.max(1, Math.round(objs.length * this.rng.range(0.1, 0.4)));
      objs.slice(0, n).forEach((o) => this.ignored.add(o.id));
    }
    this.decide();
  }

  emit(kind, text, obj = null) {
    this.onEvent({ t: this.now, kind, text, obj });
  }

  holdTime() {
    const r = this.rng.rand();
    if (r < 0.05) return this.rng.range(0.8, 1.4);
    if (r < 0.8) return this.rng.range(2, 3);
    return this.rng.range(5, 6);
  }

  pickObject() {
    const cur = this.target?.obj?.id;
    const pairs = this.room.objects
      .filter((o) => !this.ignored.has(o.id))
      .map((o) => {
        const d = Math.hypot(o.x + o.w / 2 - this.x, o.y + o.h / 2 - this.y);
        let w = Math.exp(-d / DIST_FALLOFF);
        if (o.id === cur) w *= 0.15; // may go back to the same object, but rarely straight away
        else if (this.recent.includes(o.id)) w *= 0.35;
        else if (!this.visits.has(o.id)) w *= 3; // pull towards unexplored objects
        return [o, w];
      });
    return this.rng.weighted(pairs);
  }

  decide() {
    const r = this.rng.rand();
    if (r < 0.03) {
      this.state = 'sit';
      this.timer = this.rng.range(3, 6);
      this.emit('sit', 'Dog pauses');
      return;
    }
    if (r < 0.22) {
      const p = randomFreePoint(this.room, this.rng.rand);
      if (this.goTo(p, null)) return;
    }
    for (let i = 0; i < 6; i++) {
      const obj = this.pickObject();
      if (!obj) break;
      const spot = this.nearestApproach(obj);
      if (this.goTo(spot, obj)) return;
    }
    // Nothing reachable picked: wander instead.
    this.goTo(randomFreePoint(this.room, this.rng.rand), null);
  }

  nearestApproach(obj) {
    // Usually the closest side, sometimes another side of the object.
    const sorted = obj.approaches
      .map((p) => [p, Math.hypot(p.x - this.x, p.y - this.y)])
      .sort((a, b) => a[1] - b[1]);
    const idx = this.rng.chance(0.7) ? 0 : this.rng.int(0, sorted.length - 1);
    return sorted[idx][0];
  }

  goTo(point, obj) {
    const path = findPath(this.room.grid, { x: this.x, y: this.y }, point);
    if (!path) return false;
    this.path = path;
    this.pathIdx = 1;
    this.target = { point, obj };
    this.state = 'move';
    this.speed = this.rng.range(0.9, 1.35);
    return true;
  }

  update(dt, now) {
    this.now = now;
    if (this.state === 'idle') return;

    if (this.state === 'move') {
      let step = this.speed * dt;
      while (step > 0 && this.pathIdx < this.path.length) {
        const wp = this.path[this.pathIdx];
        const dx = wp.x - this.x;
        const dy = wp.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) { this.pathIdx++; continue; }
        this.turnTowards(Math.atan2(dy, dx), dt);
        const m = Math.min(step, d);
        this.x += (dx / d) * m;
        this.y += (dy / d) * m;
        step -= m;
        if (m === d) this.pathIdx++;
      }
      if (this.pathIdx >= this.path.length) this.arrive();
    } else {
      const obj = this.target?.obj;
      if (this.state === 'sniff' && obj) {
        const cx = Math.min(Math.max(this.x, obj.x), obj.x + obj.w);
        const cy = Math.min(Math.max(this.y, obj.y), obj.y + obj.h);
        this.turnTowards(Math.atan2(cy - this.y, cx - this.x), dt);
      }
      this.timer -= dt;
      if (this.timer <= 0) this.decide();
    }

    this.trailClock += dt;
    if (this.trailClock > 0.12) {
      this.trailClock = 0;
      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 260) this.trail.shift();
    }
  }

  turnTowards(angle, dt) {
    let diff = angle - this.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const max = TURN_RATE * dt;
    this.heading += Math.max(-max, Math.min(max, diff));
  }

  arrive() {
    const obj = this.target.obj;
    if (obj) {
      const hold = this.holdTime();
      const n = (this.visits.get(obj.id) || 0) + 1;
      this.visits.set(obj.id, n);
      this.recent = [obj.id, ...this.recent.filter((id) => id !== obj.id)].slice(0, 3);
      this.sniffCount++;
      this.state = 'sniff';
      this.timer = hold;
      this.emit('sniff', `${obj.label}${n > 1 ? ' (again)' : ''} · ${hold.toFixed(1)}s`, obj);
    } else {
      this.state = 'roamPause';
      this.timer = this.rng.range(0.4, 1.8);
      this.emit('roam', 'Searching the floor');
    }
  }
}
