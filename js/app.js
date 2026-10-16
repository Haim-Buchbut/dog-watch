import { generateRoom, describeRoom } from './room.js';
import { randomSeedString } from './rng.js';
import { Dog } from './dog.js';
import { fitView, drawRoom, drawTrail, drawDog } from './render.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

const state = {
  room: null,
  dog: null,
  running: false,
  hasRun: false,
  startTs: 0,
  elapsed: 0,
  lastTs: 0,
  wakeLock: null,
};

function fmt(t, tenths = true) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const base = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return tenths ? `${base}.${Math.floor((t * 10) % 10)}` : base;
}

function loadRoom(seed, push = true) {
  state.room = generateRoom(seed);
  state.dog = new Dog(state.room);
  state.dog.onEvent = logEvent;
  state.hasRun = false;
  state.elapsed = 0;
  $('room-info').textContent = `Room ${seed} · ${describeRoom(state.room)}`;
  $('timer').textContent = fmt(0);
  $('summary').hidden = true;
  $('status').textContent = 'Press Start to bring the dog in';
  if (push) {
    const url = new URL(location.href);
    url.searchParams.set('room', seed);
    url.hash = '';
    history.replaceState(null, '', url);
  }
}

function logEvent(ev) {
  $('status').textContent =
    ev.kind === 'sniff' ? `Sniffing ${ev.obj.label}` : ev.kind === 'sit' ? 'Dog pauses…' : 'Searching the floor';
}

async function start() {
  state.dog.onEvent = logEvent;
  $('summary').hidden = true;
  state.running = true;
  state.hasRun = true;
  state.startTs = performance.now();
  state.elapsed = 0;
  state.dog.start(0);
  setControls();
  try { state.wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* optional */ }
}

function stop() {
  state.running = false;
  state.dog.state = 'idle';
  setControls();
  state.wakeLock?.release?.().catch(() => {});
  state.wakeLock = null;
  $('status').textContent = 'Search finished';
  showSummary();
}

function setControls() {
  const b = $('btn-start');
  b.textContent = state.running ? 'Stop' : state.hasRun ? 'Start again' : 'Start';
  b.classList.toggle('stop', state.running);
  $('btn-new').disabled = state.running;
  $('btn-variations').disabled = state.running;
}

function showSummary() {
  const { room, dog } = state;
  const total = room.objects.length;
  const checked = room.objects.filter((o) => dog.visits.has(o.id));
  const missed = room.objects.filter((o) => !dog.visits.has(o.id));
  const pct = Math.round((checked.length / total) * 100);
  const el = $('summary');
  el.innerHTML = `
    <span class="close" aria-label="Close">×</span>
    <div class="result">✓ No indication. Room is clean.</div>
    <dl>
      <dt>Duration</dt><dd>${fmt(state.elapsed)}</dd>
      <dt>Objects checked</dt><dd>${checked.length} / ${total} (${pct}%)</dd>
      <dt>Sniff stops</dt><dd>${dog.sniffCount}</dd>
    </dl>
    ${missed.length ? `<div class="missed">Not reached: ${missed.map((o) => o.label).join(', ')}</div>` : '<div class="missed">Every object was checked.</div>'}
  `;
  el.hidden = false;
}

// Canvas sizing
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const r = $('stage').getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
new ResizeObserver(resize).observe($('stage'));

function frame(ts) {
  const dt = Math.min(0.1, (ts - (state.lastTs || ts)) / 1000);
  state.lastTs = ts;
  if (state.running) {
    state.elapsed = (ts - state.startTs) / 1000;
    state.dog.update(dt, state.elapsed);
    $('timer').textContent = fmt(state.elapsed);
  }
  draw(ts / 1000);
  requestAnimationFrame(frame);
}

function draw(time) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!state.room || w < 10) return;
  const view = fitView(state.room, w, h, 18);
  const { dog } = state;
  drawRoom(ctx, state.room, view, {
    visited: $('opt-coverage').checked && state.hasRun ? new Set(dog.visits.keys()) : null,
    highlight: dog.state === 'sniff' ? dog.target.obj.id : null,
    labels: $('opt-labels').checked,
  });
  if (state.hasRun) drawTrail(ctx, dog.trail, view);
  drawDog(ctx, dog, view, state.running ? time : 0);
}

// Variations
function showVariations() {
  const grid = $('variations-grid');
  grid.innerHTML = '';
  const dlg = $('variations');
  if (!dlg.open) dlg.showModal();
  for (let i = 0; i < 9; i++) {
    const seed = randomSeedString();
    const room = generateRoom(seed);
    const card = document.createElement('button');
    card.className = 'card';
    const c = document.createElement('canvas');
    const p = document.createElement('p');
    p.textContent = describeRoom(room);
    card.append(c, p);
    grid.append(card);
    const dpr = window.devicePixelRatio || 1;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    c.width = cw * dpr;
    c.height = ch * dpr;
    const cx = c.getContext('2d');
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRoom(cx, room, fitView(room, cw, ch, 8));
    card.addEventListener('click', () => {
      loadRoom(seed);
      setControls();
      dlg.close();
    });
  }
}

$('btn-start').addEventListener('click', () => (state.running ? stop() : start()));
$('btn-new').addEventListener('click', () => { loadRoom(randomSeedString()); setControls(); });
$('btn-variations').addEventListener('click', showVariations);
$('btn-more').addEventListener('click', showVariations);
$('btn-close').addEventListener('click', () => $('variations').close());
$('summary').addEventListener('click', () => { $('summary').hidden = true; });

const params = new URLSearchParams(location.search);
const openVariations = location.hash === '#variations';
loadRoom(params.get('room') || randomSeedString(), true);
setControls();
resize();
requestAnimationFrame(frame);
if (openVariations) showVariations();

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  navigator.serviceWorker.register('sw.js');
}
