// The game's words, in Russian: the TS Hub is Russian only, and so is the game
// (user request 2026-10-15). The rules, the UI and the editor build their
// sentences from these, in the forms Russian needs (a terrain "in it", a
// hexside "behind it", a status that agrees with a group or the SL), and
// count things with plural().

// 1 ход, 2 хода, 5 ходов.
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b > 1 && b < 5) return few;
  return many;
}
export const count = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;
export const hexes = (n) => count(n, 'гекс', 'гекса', 'гексов');
export const turnsText = (n) => count(n, 'ход', 'хода', 'ходов');
export const diceText = (n) => count(n, 'кубик', 'кубика', 'кубиков');
export const menText = (n) => count(n, 'боец', 'бойца', 'бойцов');
export const hitsText = (n) => count(n, 'попадание', 'попадания', 'попаданий');

// Terrain: the name (palette, hex card), where a unit in it is (cover), the word in a sentence.
export const TERRAIN = {
  open: { name: 'Поле', in: 'в поле', word: 'поле' },
  road: { name: 'Дорога', in: 'на дороге', word: 'дорога' },
  scrub: { name: 'Кустарник', in: 'в кустарнике', word: 'кустарник' },
  woods: { name: 'Лес', in: 'в лесу', word: 'лес' },
  rubble: { name: 'Развалины', in: 'в развалинах', word: 'развалины' },
  building: { name: 'Здание', in: 'в здании', word: 'здание' },
  trench: { name: 'Окоп', in: 'в окопе', word: 'окоп' },
  water: { name: 'Вода', in: 'в воде', word: 'вода' },
};
export const terrainWord = (t) => TERRAIN[t]?.word ?? t;
export const terrainIn = (t) => TERRAIN[t]?.in ?? t;

// Hexside features: the name, a unit behind it, the word in a sentence.
export const FEATURE = {
  wall: { name: 'Стена', behind: 'за стеной', word: 'стена' },
  hedge: { name: 'Изгородь', behind: 'за изгородью', word: 'изгородь' },
  parapet: { name: 'Бруствер', behind: 'за бруствером', word: 'бруствер' },
};
export const featureWord = (f) => FEATURE[f]?.word ?? f;

// Hex sides as compass points.
export const SIDE = { E: 'В', SE: 'ЮВ', SW: 'ЮЗ', W: 'З', NW: 'СЗ', NE: 'СВ' };
export const sideName = (s) => SIDE[s] ?? s;

// The turn's phases (balance.json turn.phases names).
export const PHASE = { movement: 'Движение', firefight: 'Огонь', rally: 'Восстановление', 'enemy action': 'Ход противника' };
export const phaseName = (p) => PHASE[p] ?? p;

// Soldiers by role, short (unit cards, counters): a fireteam, the SL, the HMG crew.
export const ROLE = { TL: 'КГ', AR: 'П', GRN: 'Г', RFL: 'С', SL: 'КО', GNR: 'Н', AG: 'ПН', AMMO: 'ПБ' };
export const ROLE_FULL = {
  TL: 'командир группы', AR: 'пулемётчик', GRN: 'гранатомётчик', RFL: 'стрелок', SL: 'командир отделения',
  GNR: 'наводчик', AG: 'помощник наводчика', AMMO: 'подносчик',
};

// A unit by name: the SL is «КО»; teams keep their call signs (ALPHA, BRAVO...).
export const unitName = (u) => (u.kind === 'leader' ? 'КО' : u.team);
// A unit's kind in words: a fireteam, the SL, a unit type (balance.unitTypes) by its English name.
const TYPE_NAMES = { 'HMG team': 'расчёт пулемёта' };
export const typeName = (name) => TYPE_NAMES[name] ?? name;

// Words that agree with the unit: a fireteam («группа», feminine), the SL (masculine), an HMG crew («расчёт»).
export function agree(u, { team, leader, crew = leader }) {
  if (u.kind === 'leader') return leader;
  return u.type ? crew : team;
}
const STATUS = {
  ok: { team: 'в строю', leader: 'в строю' },
  suppressed: { team: 'подавлена', leader: 'подавлен' },
  pinned: { team: 'прижата', leader: 'прижат' },
  eliminated: { team: 'уничтожена', leader: 'выбыл', crew: 'уничтожен' },
};
export const statusText = (u, status = u.status) => agree(u, STATUS[status] ?? { team: status, leader: status });

// Sides: kept as they are (BLUFOR, OPFOR), as the community says.
export const sideWord = (s) => s;
