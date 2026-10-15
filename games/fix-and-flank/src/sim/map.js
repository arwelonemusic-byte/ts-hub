// Hex map: one character per hex in odd-r offset rows, a legend mapping
// characters to terrain types from balance.terrain, hexside features, and
// the units' start hexes. Parsed maps are frozen and shared between states.
//
// hexsides: [{ hex: [col, row], sides: ['SE', 'SW'], feature: 'parapet' }]
// A feature whose balance.hexsides entry is `shared` (wall, hedge) is on the
// edge between two hexes and counts for both; one that is not (parapet)
// belongs only to the hex it is listed on.

import { SIDES, key, neighborOn, opposite } from './hex.js';

export function parseMap(json, balance) {
  const { name = 'Untitled', description = '', width, height, legend, rows, units = [], objective = null, hexsides = [], mission = null } = json;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`Размер карты — целые положительные числа, а не ${width} x ${height}`);
  }
  if (!Array.isArray(rows) || rows.length !== height) throw new Error(`Строк в карте ${rows?.length}, а нужно ${height}`);
  for (const [char, terrain] of Object.entries(legend ?? {})) {
    if (!balance.terrain[terrain]) throw new Error(`Легенда «${char}»: неизвестная местность «${terrain}»`);
  }
  const terrain = [];
  rows.forEach((r, row) => {
    const chars = [...r];
    if (chars.length !== width) throw new Error(`В строке ${row} гексов ${chars.length}, а нужно ${width}`);
    chars.forEach((c, col) => {
      if (!legend[c]) throw new Error(`Неизвестный гекс «${c}» на ${col},${row}`);
      terrain.push(legend[c]);
    });
  });
  if (mission) {
    const [col, row] = Array.isArray(objective) ? objective : [];
    const onMap = Number.isInteger(col) && Number.isInteger(row) && col >= 0 && row >= 0 && col < width && row < height;
    if (!onMap) throw new Error(`Задаче нужен гекс объекта на карте, а указан ${JSON.stringify(objective)}`);
  }
  const map = { name, description, width, height, terrain: Object.freeze(terrain), units: Object.freeze(units.map((u) => Object.freeze({ ...u }))), objective, mission: mission ? Object.freeze({ ...mission }) : null, sides: {} };

  // sides: "col,row" -> { SIDE: feature }
  const put = (h, side, feature) => {
    map.sides[key(h)] ??= {};
    map.sides[key(h)][side] = feature;
  };
  for (const entry of hexsides) {
    const h = { col: entry.hex?.[0], row: entry.hex?.[1] };
    const f = balance.hexsides[entry.feature];
    if (!f) throw new Error(`Сторона гекса ${key(h)}: неизвестное препятствие «${entry.feature}»`);
    if (!inBounds(map, h)) throw new Error(`Сторона гекса ${key(h)} (${entry.feature}) за краем карты`);
    for (const side of entry.sides ?? []) {
      if (!SIDES.includes(side)) throw new Error(`Сторона гекса ${key(h)}: неизвестная сторона «${side}» (можно ${SIDES.join(', ')})`);
      put(h, side, entry.feature);
      const n = neighborOn(h, side);
      if (f.shared && inBounds(map, n)) put(n, opposite(side), entry.feature);
    }
  }
  for (const v of Object.values(map.sides)) Object.freeze(v);
  Object.freeze(map.sides);

  const taken = new Set();
  for (const u of units) {
    const [col, row] = u.pos ?? [];
    const h = { col, row };
    if (!inBounds(map, h)) throw new Error(`${u.side} ${u.team} начинает за краем карты`);
    if (terrainOf(map, balance, h).move === 'impassable') throw new Error(`${u.side} ${u.team} начинает на непроходимой местности, ${col},${row}`);
    // One fireteam per hex, plus a leader.
    const slot = `${col},${row},${u.kind ?? 'team'}`;
    if (taken.has(slot)) throw new Error(`Два подразделения начинают на ${col},${row}`);
    taken.add(slot);
  }
  return Object.freeze(map);
}

export function inBounds(map, h) {
  return Number.isInteger(h?.col) && Number.isInteger(h?.row) && h.col >= 0 && h.row >= 0 && h.col < map.width && h.row < map.height;
}

export function terrainName(map, h) {
  return map.terrain[h.row * map.width + h.col];
}

// Feature on side `side` of hex h, or null.
export function sideFeature(map, h, side) {
  return map.sides[key(h)]?.[side] ?? null;
}

export function terrainOf(map, balance, h) {
  return balance.terrain[terrainName(map, h)];
}
