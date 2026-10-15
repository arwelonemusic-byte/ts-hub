// Canvas drawing of the marks over the map (moves, fire zones, paths, lines
// of fire, suspected contacts, the objective) and of the counters and bangs.
// The 3D view (world3d.js) draws the marks onto the canvas it lays over the
// ground, and each counter and bang onto a texture. Reads state, never changes it.

import { toScreen } from './camera.js';
import { center, corners } from '../sim/hex.js';

const FONT = "'Barlow Condensed', 'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', sans-serif";

export const COLORS = {
  // Terrain swatches (the hex card, the editor's palette).
  terrain: {
    open: '#c4cb98',
    road: '#d6cdb0',
    scrub: '#a7b77c',
    woods: '#7d9a62',
    rubble: '#b9b1a1',
    building: '#ada291',
    trench: '#b8a173',
    water: '#9fc2d4',
  },
  // Counters and markers after the "Fireteam Counters" design: NATO frames,
  // ink outlines, amber suppressed and dark red pinned badges.
  blufor: '#80e0ff',
  opfor: '#ff8080',
  ink: '#15181a',
  counterEdge: '#15181a',
  counterText: '#15181a',
  label: '#f6f4ee',
  suppressed: '#f2b33d',
  pinned: '#8e1b12',
  pinnedInk: '#ffffff',
  hatch: 'rgba(21, 24, 26, 0.28)',
  exposed: '#f6f4ee',
  select: '#15181a',
  selectHalo: '#f6f4ee',
  hoverHalo: 'rgba(244, 219, 80, 0.38)', // the counter a click would select: the TS yellow
  hoverEdge: '#f4db50',
  invalid: '#ff6a3d',
  fireInk: '#1f3f8f',
  bang: '#f2b33d',
  bangCore: '#d9481c',
  hostileFireInk: '#8e1b12',
  move: '#2fa8ff',   // bright blue: a 1-hex move, and planned paths
  fast: '#ffd60a',   // bright yellow: a 2-hex fast move
  shade: 'rgba(10, 12, 14, 0.66)', // out of line of sight
  suspect: '#8e1b12',
  fire: '#1f3f8f',
  fireZone: 'rgba(31, 63, 143, 0.09)',
  assault: '#ff5a3d',
  plan: '#15181a',
  objective: '#8e1b12',
};

function hexPath(ctx, cam, h, inset = 0) {
  const c = center(h);
  const pts = corners(h).map((p) => toScreen(cam, c.x + (p.x - c.x) * (1 - inset), c.y + (p.y - c.y) * (1 - inset)));
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

// The objective: a dashed outline inside its hex, labelled «ОБЪ» (объект).
export function drawObjective(ctx, cam, objective, color = COLORS.objective) {
  const c = toScreen(cam, center(objective).x, center(objective).y);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  hexPath(ctx, cam, objective, 0.08);
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = `700 ${Math.round(cam.scale * 0.34)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ОБЪ', c.x, c.y - cam.scale * 0.6);
}

// Suspected contacts: a dashed red outline with a question mark, at hex centers.
export function drawSuspected(ctx, cam, hexes) {
  for (const h of hexes) {
    const c = toScreen(cam, center(h).x, center(h).y);
    const w = cam.scale * 0.9;
    const hh = w * 0.78;
    ctx.strokeStyle = COLORS.suspect;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(c.x - w / 2, c.y - hh / 2, w, hh);
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.suspect;
    ctx.font = `700 ${Math.round(cam.scale * 0.55)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', c.x, c.y + 1);
  }
}

// Hex outlines: [{ hex, color, width, dashed, fill }]
export function drawHexMarks(ctx, cam, marks) {
  for (const m of marks) {
    hexPath(ctx, cam, m.hex, m.inset ?? 0.1);
    if (m.fill) {
      ctx.fillStyle = m.fill;
      ctx.fill();
    }
    if (!m.color) continue;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = m.width ?? 2;
    ctx.setLineDash(m.dashed ? [5, 4] : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// A planned path: hex centers joined by a line.
export function drawPath(ctx, cam, from, path, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, cam.scale * 0.08);
  ctx.beginPath();
  [from, ...path].forEach((h, i) => {
    const c = center(h);
    const p = toScreen(cam, c.x, c.y);
    i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
  });
  ctx.stroke();
}

// Fire marker: crosshair (ring, four ticks, center dot) of radius r at (x, y).
function crosshair(ctx, x, y, r, color, width) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    ctx.moveTo(x + dx * r, y + dy * r);
    ctx.lineTo(x + dx * r * 0.4, y + dy * r * 0.4);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
}

// A line of fire: dashed, from hex center to a crosshair on the target hex,
// tagged with the shooter's letter when given.
export function drawFire(ctx, cam, from, to, color, alpha = 1, tag = null) {
  const a = center(from);
  const b = center(to);
  const p = toScreen(cam, a.x, a.y);
  const q = toScreen(cam, b.x, b.y);
  const r = Math.max(7, cam.scale * 0.42);
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, cam.scale * 0.06);
  ctx.setLineDash([cam.scale * 0.2, cam.scale * 0.14]);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x - ((q.x - p.x) / len) * r * 0.55, q.y - ((q.y - p.y) / len) * r * 0.55);
  ctx.stroke();
  ctx.setLineDash([]);
  crosshair(ctx, q.x, q.y, r, color, Math.max(2, cam.scale * 0.06));
  if (tag) {
    const size = Math.max(10, Math.round(cam.scale * 0.32));
    ctx.font = `700 ${size}px ${FONT}`;
    const tw = ctx.measureText(tag).width + size * 0.4;
    const tx = q.x - r * 0.75 - tw; // upper left: clear of the target's state badge
    const ty = q.y - r * 1.05;
    ctx.fillStyle = color;
    ctx.fillRect(tx, ty, tw, size * 1.1);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, tx + tw / 2, ty + size * 0.58);
  }
  ctx.restore();
}

// The label next to a counter: the team's letter, or the leader's name (SL).
export function counterLabel(unit) {
  return unit.kind === 'leader' ? 'SL' : unit.team.charAt(0); // «SL» for the squad leader, a team its call sign's letter
}

// A bang: a starburst on a hex that is fired on, popping in and fading.
// t runs 0..1 over its life; k (0 or 1) picks its spot in the hex.
export function drawBang(ctx, cam, hex, t, k = 0) {
  if (t < 0 || t > 1) return;
  const spot = k ? { x: 0.3, y: 0.2 } : { x: -0.25, y: -0.18 };
  const c = center(hex);
  const p = toScreen(cam, c.x + spot.x, c.y + spot.y);
  const pop = t < 0.15 ? 0.4 + (t / 0.15) * 0.75 : t < 0.3 ? 1.15 - ((t - 0.15) / 0.15) * 0.15 : 1;
  const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  const R = cam.scale * 0.55 * pop;
  const star = (outer, inner, n, turn) => {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = (i / (n * 2)) * Math.PI * 2 + turn;
      i ? ctx.lineTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r) : ctx.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    }
    ctx.closePath();
  };
  ctx.save();
  ctx.globalAlpha = alpha;
  star(R, R * 0.5, 9, k * 0.3);
  ctx.fillStyle = COLORS.bang;
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = Math.max(1.5, cam.scale * 0.045);
  ctx.stroke();
  star(R * 0.55, R * 0.28, 7, 0.2 + k * 0.3);
  ctx.fillStyle = COLORS.bangCore;
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A chevron pointing down, centered at (x, y), w wide.
function chevron(ctx, x, y, w, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - w * 0.3);
  ctx.lineTo(x, y + w * 0.3);
  ctx.lineTo(x + w / 2, y - w * 0.3);
  ctx.stroke();
}

// State badge on the counter's top-right corner: suppressed = amber, one
// chevron; pinned = dark red, two white chevrons. Exposed: a pale "!" badge
// on the top-left corner.
function stateBadge(ctx, x, y, unit, size) {
  const w = size * 0.48;
  if (unit.status === 'suppressed' || unit.status === 'pinned') {
    const pinned = unit.status === 'pinned';
    const h = size * (pinned ? 0.42 : 0.33);
    roundRect(ctx, x - w / 2, y - h / 2, w, h, size * 0.06);
    ctx.fillStyle = pinned ? COLORS.pinned : COLORS.suppressed;
    ctx.fill();
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.stroke();
    const ink = pinned ? COLORS.pinnedInk : COLORS.ink;
    const cw = w * 0.45;
    const lw = Math.max(1.2, size * 0.045);
    if (pinned) {
      chevron(ctx, x, y - h * 0.17, cw, ink, lw);
      chevron(ctx, x, y + h * 0.2, cw, ink, lw);
    } else {
      chevron(ctx, x, y, cw, ink, lw);
    }
  }
}

function exposedBadge(ctx, x, y, size) {
  const w = size * 0.3;
  const h = size * 0.33;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, size * 0.06);
  ctx.fillStyle = COLORS.exposed;
  ctx.fill();
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.stroke();
  ctx.fillStyle = COLORS.ink;
  ctx.font = `700 ${Math.round(h * 0.95)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + h * 0.05);
}

// The NATO frame: friendly = rectangle, hostile = diamond; infantry X inside.
function frame(ctx, side, x0, y0, w, h) {
  ctx.beginPath();
  if (side === 'OPFOR') {
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    const r = h * 0.72;
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
  } else {
    ctx.rect(x0, y0, w, h);
  }
}

function infantryX(ctx, side, x0, y0, w, h, lw) {
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = lw;
  ctx.beginPath();
  if (side === 'OPFOR') {
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;
    const d = h * 0.36;
    ctx.moveTo(cx - d, cy - d);
    ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d);
    ctx.lineTo(cx - d, cy + d);
  } else {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + w, y0 + h);
    ctx.moveTo(x0 + w, y0);
    ctx.lineTo(x0, y0 + h);
  }
  ctx.stroke();
}

// Machine gun (NATO): a vertical arrow through the frame.
function machineGun(ctx, x0, y0, w, h, lw) {
  const cx = x0 + w / 2;
  const top = y0 + h * 0.12;
  const head = h * 0.22;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = lw;
  ctx.beginPath();
  ctx.moveTo(cx, y0 + h * 0.9);
  ctx.lineTo(cx, top);
  ctx.moveTo(cx - head, top + head);
  ctx.lineTo(cx, top);
  ctx.lineTo(cx + head, top + head);
  ctx.stroke();
}

// Echelon mark above the frame: fireteam = circle with a slash, squad (the SL) = one dot.
function echelon(ctx, kind, x, y, size) {
  ctx.strokeStyle = COLORS.ink;
  ctx.fillStyle = COLORS.ink;
  if (kind === 'leader') {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.06, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const r = size * 0.085;
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r * 1.5, y + r * 1.5);
  ctx.lineTo(x + r * 1.5, y - r * 1.5);
  ctx.stroke();
}

// Counters after the "Fireteam Counters" design. units: [{ unit, pos: {x, y}
// world center, selected, stackedWithTeam, ghost, hovered }]. A fireteam: NATO frame
// with the infantry X and the fireteam mark above, its letter to the right,
// one pip per soldier below (filled: present, hollow: lost). Pinned teams are
// hatched. The SL: a smaller counter with the squad dot, at the hex's lower
// left when it shares the hex with a team.
export function drawCounters(ctx, cam, units, rosterOf) {
  for (const { unit, pos, selected, stackedWithTeam, ghost, hovered } of units) {
    if (unit.status === 'eliminated') continue;
    const leader = unit.kind === 'leader';
    const size = cam.scale * (leader ? 0.64 : 1.06);
    // Sharing a hex with a team, the SL sits at its lower left, clear of the team's badges and pips.
    const stacked = leader && stackedWithTeam;
    const c = toScreen(cam, pos.x - (stacked ? 0.55 : 0), pos.y + (stacked ? 0.62 : 0));
    const w = size;
    const h = size / 1.5;
    const x0 = c.x - w / 2 - (leader ? 0 : size * 0.1);
    const y0 = c.y - h / 2;
    const lw = Math.max(1.2, size * 0.045);

    ctx.globalAlpha = ghost ? 0.3 : unit.activated ? 0.55 : 1;
    if (hovered) {
      // Under the pointer, a click away from being selected: a yellow halo.
      const pad = size * 0.16;
      frame(ctx, unit.side, x0 - pad, y0 - pad, w + pad * 2, h + pad * 2);
      ctx.fillStyle = COLORS.hoverHalo;
      ctx.fill();
      ctx.strokeStyle = COLORS.hoverEdge;
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.stroke();
    }
    if (selected) {
      const pad = size * 0.09;
      frame(ctx, unit.side, x0 - pad, y0 - pad, w + pad * 2, h + pad * 2);
      ctx.fillStyle = COLORS.selectHalo;
      ctx.fill();
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.setLineDash([size * 0.12, size * 0.07]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    frame(ctx, unit.side, x0, y0, w, h);
    ctx.fillStyle = unit.side === 'OPFOR' ? COLORS.opfor : COLORS.blufor;
    ctx.fill();
    if (unit.status === 'pinned') {
      ctx.save();
      frame(ctx, unit.side, x0, y0, w, h);
      ctx.clip();
      ctx.strokeStyle = COLORS.hatch;
      ctx.lineWidth = Math.max(1, size * 0.03);
      const step = Math.max(4, size * 0.1);
      ctx.beginPath();
      for (let d = -h * 2; d < w + h * 2; d += step) {
        ctx.moveTo(x0 + d, y0 - h);
        ctx.lineTo(x0 + d + h * 2, y0 + h * 2);
      }
      ctx.stroke();
      ctx.restore();
    }
    infantryX(ctx, unit.side, x0, y0, w, h, lw);
    if (unit.type === 'hmg') machineGun(ctx, x0, y0, w, h, lw);
    frame(ctx, unit.side, x0, y0, w, h);
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = lw;
    ctx.stroke();

    const top = unit.side === 'OPFOR' ? y0 + h / 2 - h * 0.72 : y0;
    echelon(ctx, unit.kind, x0 + w / 2, top - size * 0.16, size);

    // Letter (team) or SL to the right of the frame, on a pale plate so it reads on any terrain.
    const label = counterLabel(unit);
    const fs = Math.max(9, Math.round(size * (leader ? 0.42 : 0.4)));
    ctx.font = `700 ${fs}px ${FONT}`;
    const lx = x0 + w + (unit.side === 'OPFOR' ? h * 0.25 : 0) + size * 0.06;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = COLORS.label;
    ctx.fillRect(lx - fs * 0.08, y0 + h - fs * 0.92, tw + fs * 0.16, fs * 0.98);
    ctx.fillStyle = COLORS.counterText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(label, lx, y0 + h - fs * 0.12);

    // Pips: one per soldier of the full team, below the frame.
    if (!leader) {
      const r = Math.max(1.6, size * 0.045);
      const gap = r * 2.7;
      const py = (unit.side === 'OPFOR' ? y0 + h / 2 + h * 0.72 : y0 + h) + r * 2.2;
      const roster = rosterOf(unit);
      const px0 = x0 + w / 2 - ((roster.length - 1) * gap) / 2;
      ctx.lineWidth = Math.max(1, r * 0.5);
      for (let i = 0; i < roster.length; i++) {
        ctx.beginPath();
        ctx.arc(px0 + i * gap, py, r, 0, Math.PI * 2);
        ctx.fillStyle = i < unit.soldiers.length ? COLORS.ink : COLORS.label;
        ctx.fill();
        ctx.strokeStyle = COLORS.ink;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = ghost ? 0.3 : 1;
    const right = unit.side === 'OPFOR' ? x0 + w / 2 + h * 0.6 : x0 + w;
    stateBadge(ctx, right, top + size * 0.04, unit, size);
    if (unit.exposed) exposedBadge(ctx, unit.side === 'OPFOR' ? x0 + w / 2 - h * 0.6 : x0, top + size * 0.04, size);
    ctx.globalAlpha = 1;
  }
}
