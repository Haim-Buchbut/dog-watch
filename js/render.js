// Top-down canvas drawing of the room, its objects and the dog.

const WALL = 0.14; // drawn wall thickness in metres

export function fitView(room, cw, ch, pad = 12) {
  const scale = Math.min((cw - pad * 2) / (room.w + WALL * 2), (ch - pad * 2) / (room.h + WALL * 2));
  return {
    scale,
    ox: (cw - room.w * scale) / 2,
    oy: (ch - room.h * scale) / 2,
  };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function drawRoom(ctx, room, view, opts = {}) {
  const { scale: k, ox, oy } = view;
  const { visited = null } = opts;
  ctx.save();
  ctx.translate(ox, oy);

  // Floor
  ctx.fillStyle = '#e9dfcf';
  ctx.fillRect(0, 0, room.w * k, room.h * k);
  ctx.strokeStyle = 'rgba(120, 95, 60, 0.12)';
  ctx.lineWidth = 1;
  for (let x = 0.5; x < room.w; x += 0.5) {
    ctx.beginPath();
    ctx.moveTo(x * k, 0);
    ctx.lineTo(x * k, room.h * k);
    ctx.stroke();
  }
  for (let y = 0.5; y < room.h; y += 0.5) {
    ctx.beginPath();
    ctx.moveTo(0, y * k);
    ctx.lineTo(room.w * k, y * k);
    ctx.stroke();
  }

  // Walls with a door gap
  const t = WALL * k;
  ctx.fillStyle = '#3d4148';
  ctx.fillRect(-t, -t, room.w * k + 2 * t, t);
  ctx.fillRect(-t, room.h * k, room.w * k + 2 * t, t);
  ctx.fillRect(-t, 0, t, room.h * k);
  ctx.fillRect(room.w * k, 0, t, room.h * k);
  const d = room.door;
  const a = d.s * k;
  const b = (d.s + d.w) * k;
  ctx.fillStyle = '#e9dfcf';
  ctx.strokeStyle = '#8a7a63';
  ctx.lineWidth = Math.max(1, k * 0.02);
  ctx.beginPath();
  if (d.side === 0) {
    ctx.fillRect(a, -t, b - a, t);
    ctx.moveTo(a, 0); ctx.lineTo(a, (b - a)); ctx.arc(a, 0, b - a, Math.PI / 2, 0, true);
  } else if (d.side === 2) {
    ctx.fillRect(a, room.h * k, b - a, t);
    const y = room.h * k;
    ctx.moveTo(a, y); ctx.lineTo(a, y - (b - a)); ctx.arc(a, y, b - a, -Math.PI / 2, 0);
  } else if (d.side === 3) {
    ctx.fillRect(-t, a, t, b - a);
    ctx.moveTo(0, a); ctx.lineTo(b - a, a); ctx.arc(0, a, b - a, 0, Math.PI / 2);
  } else {
    const x = room.w * k;
    ctx.fillRect(x, a, t, b - a);
    ctx.moveTo(x, a); ctx.lineTo(x - (b - a), a); ctx.arc(x, a, b - a, Math.PI, Math.PI / 2, true);
  }
  ctx.stroke();

  for (const o of room.objects) drawObject(ctx, o, k);

  // Coverage review: objects the dog sniffed are tinted green, ones it never reached get a red outline.
  if (visited) {
    for (const o of room.objects) {
      rr(ctx, o.x * k - 2, o.y * k - 2, o.w * k + 4, o.h * k + 4, 5);
      if (visited.has(o.id)) {
        ctx.fillStyle = 'rgba(46, 160, 67, 0.35)';
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(200, 40, 40, 0.9)';
        ctx.lineWidth = Math.max(2, k * 0.04);
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  ctx.restore();
}

function drawObject(ctx, o, k) {
  const x = o.x * k, y = o.y * k, w = o.w * k, h = o.h * k;
  const lw = Math.max(1, k * 0.015);
  ctx.lineWidth = lw;
  switch (o.type) {
    case 'bed': {
      ctx.fillStyle = '#6d4c41';
      rr(ctx, x, y, w, h, 2); ctx.fill();
      const m = k * 0.06;
      ctx.fillStyle = '#c9d6e3';
      rr(ctx, x + m, y + m, w - 2 * m, h - 2 * m, 4); ctx.fill();
      // blanket
      const horiz = w > h;
      ctx.fillStyle = '#5b7fa6';
      if (horiz) {
        const pw = w * 0.22;
        const bx = o.pillowEnd ? x + m : x + m + pw;
        rr(ctx, bx, y + m, w - 2 * m - pw, h - 2 * m, 4); ctx.fill();
        ctx.fillStyle = '#f4f1ea';
        const px = o.pillowEnd ? x + w - m - pw * 0.9 : x + m + pw * 0.08;
        rr(ctx, px, y + h * 0.2, pw * 0.8, h * 0.6, 5); ctx.fill();
      } else {
        const ph = h * 0.22;
        const by = o.pillowEnd ? y + m : y + m + ph;
        rr(ctx, x + m, by, w - 2 * m, h - 2 * m - ph, 4); ctx.fill();
        ctx.fillStyle = '#f4f1ea';
        const py = o.pillowEnd ? y + h - m - ph * 0.9 : y + m + ph * 0.08;
        rr(ctx, x + w * 0.2, py, w * 0.6, ph * 0.8, 5); ctx.fill();
      }
      // "bunk" mark: ladder on one end
      ctx.strokeStyle = '#3e2723';
      ctx.lineWidth = Math.max(1, k * 0.025);
      ctx.beginPath();
      if (horiz) {
        const lx = o.pillowEnd ? x + m * 1.5 : x + w - m * 1.5;
        for (let i = 1; i < 4; i++) { ctx.moveTo(lx - m, y + (h * i) / 4); ctx.lineTo(lx + m, y + (h * i) / 4); }
      } else {
        const ly = o.pillowEnd ? y + m * 1.5 : y + h - m * 1.5;
        for (let i = 1; i < 4; i++) { ctx.moveTo(x + (w * i) / 4, ly - m); ctx.lineTo(x + (w * i) / 4, ly + m); }
      }
      ctx.stroke();
      break;
    }
    case 'closet': {
      ctx.fillStyle = '#a1887f';
      ctx.strokeStyle = '#5d4037';
      rr(ctx, x, y, w, h, 2); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      if (w > h) { ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); }
      else { ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); }
      ctx.stroke();
      ctx.fillStyle = '#4e342e';
      const r = Math.max(1.5, k * 0.025);
      ctx.beginPath();
      if (w > h) { ctx.arc(x + w / 2 - r * 3, y + h / 2, r, 0, 7); ctx.arc(x + w / 2 + r * 3, y + h / 2, r, 0, 7); }
      else { ctx.arc(x + w / 2, y + h / 2 - r * 3, r, 0, 7); ctx.arc(x + w / 2, y + h / 2 + r * 3, r, 0, 7); }
      ctx.fill();
      break;
    }
    case 'fridge': {
      ctx.fillStyle = '#f7f7f7';
      ctx.strokeStyle = '#9aa0a6';
      rr(ctx, x, y, w, h, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9aa0a6';
      rr(ctx, x + w * 0.25, y + h * 0.42, w * 0.5, h * 0.16, 2); ctx.fill();
      break;
    }
    case 'table': {
      ctx.fillStyle = '#c8a26b';
      ctx.strokeStyle = '#8d6e3f';
      rr(ctx, x, y, w, h, 4); ctx.fill(); ctx.stroke();
      break;
    }
    case 'chair': {
      ctx.fillStyle = '#546e7a';
      rr(ctx, x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = '#37474f';
      const bt = h * 0.2;
      // backrest on the side away from the table
      if (o.face === 1) rr(ctx, x, y, w, bt, 2);
      else if (o.face === 3) rr(ctx, x, y + h - bt, w, bt, 2);
      else if (o.face === 0) rr(ctx, x, y, bt, h, 2);
      else rr(ctx, x + w - bt, y, bt, h, 2);
      ctx.fill();
      break;
    }
    case 'kitbag':
    case 'smallbag': {
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(o.rot);
      const L = o.len * k, D = o.dep * k;
      ctx.fillStyle = o.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      rr(ctx, -L / 2, -D / 2, L, D, o.type === 'kitbag' ? D / 2 : D / 4);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      if (o.type === 'kitbag') {
        ctx.moveTo(-L * 0.42, 0); ctx.lineTo(L * 0.42, 0);
        ctx.moveTo(-L * 0.15, -D / 2); ctx.lineTo(-L * 0.15, D / 2);
        ctx.moveTo(L * 0.15, -D / 2); ctx.lineTo(L * 0.15, D / 2);
      } else {
        ctx.moveTo(-L * 0.3, -D * 0.15); ctx.lineTo(L * 0.3, -D * 0.15);
      }
      ctx.stroke();
      ctx.restore();
      break;
    }
  }
}

// A Belgian Malinois seen from above: tan body, black mask, wagging tail.
export function drawDog(ctx, dog, view, time) {
  const { scale: k, ox, oy } = view;
  const s = k; // 1 m in px
  ctx.save();
  ctx.translate(ox + dog.x * k, oy + dog.y * k);
  ctx.rotate(dog.heading);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(0.02 * s, 0.03 * s, 0.36 * s, 0.15 * s, 0, 0, 7);
  ctx.fill();

  const sitting = dog.state === 'sit';
  const sniffing = dog.state === 'sniff' || dog.state === 'roamPause';
  const wag = Math.sin(time * (sniffing ? 18 : 10)) * (sitting ? 0.15 : 0.5);

  // tail
  ctx.strokeStyle = '#7a4b1f';
  ctx.lineWidth = 0.05 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.3 * s, 0);
  ctx.quadraticCurveTo(-0.42 * s, wag * 0.12 * s, -0.52 * s, wag * 0.22 * s);
  ctx.stroke();

  // body
  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.ellipse(-0.04 * s, 0, sitting ? 0.24 * s : 0.32 * s, 0.13 * s, 0, 0, 7);
  ctx.fill();
  // darker saddle
  ctx.fillStyle = 'rgba(80, 45, 15, 0.45)';
  ctx.beginPath();
  ctx.ellipse(-0.06 * s, 0, 0.17 * s, 0.08 * s, 0, 0, 7);
  ctx.fill();

  // head (bobs while sniffing)
  const bob = sniffing ? Math.sin(time * 14) * 0.025 * s : 0;
  const look = sniffing ? Math.sin(time * 3.1) * 0.25 : 0;
  ctx.save();
  ctx.translate(0.27 * s + bob, 0);
  ctx.rotate(look);
  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.1 * s, 0.085 * s, 0, 0, 7);
  ctx.fill();
  // ears
  ctx.fillStyle = '#2b1a0e';
  ctx.beginPath();
  ctx.moveTo(-0.03 * s, -0.06 * s); ctx.lineTo(-0.09 * s, -0.13 * s); ctx.lineTo(0.02 * s, -0.08 * s);
  ctx.moveTo(-0.03 * s, 0.06 * s); ctx.lineTo(-0.09 * s, 0.13 * s); ctx.lineTo(0.02 * s, 0.08 * s);
  ctx.fill();
  // black muzzle
  ctx.fillStyle = '#2b1a0e';
  ctx.beginPath();
  ctx.ellipse(0.1 * s, 0, 0.065 * s, 0.045 * s, 0, 0, 7);
  ctx.fill();
  ctx.restore();

  // sniff puffs
  if (sniffing) {
    for (let i = 0; i < 3; i++) {
      const p = (time * 1.6 + i / 3) % 1;
      ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc((0.45 + p * 0.18) * s, (i - 1) * 0.06 * s * (0.5 + p), (0.015 + p * 0.025) * s, 0, 7);
      ctx.fill();
    }
  }
  ctx.restore();
}
