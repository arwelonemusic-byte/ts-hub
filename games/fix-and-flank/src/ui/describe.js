// Plain-words preview of a planned action and log lines for events, in Russian
// (words from ../text.js). No DOM. The preview uses the same validation and
// odds the sim uses.

import { validateAction } from '../sim/actions.js';
import { assaultSolution, assaultVia } from '../sim/assault.js';
import { fireSolution, fireSolutions, pinAt } from '../sim/combat.js';
import { chanceAtLeast } from '../sim/dice.js';
import { key } from '../sim/hex.js';
import { lineOfSight } from '../sim/los.js';
import { assaultOdds, fireOdds } from '../sim/odds.js';
import { terrainName, terrainOf } from '../sim/map.js';
import { rallyNeed } from '../sim/phases.js';
import { knownEnemies } from '../sim/spotting.js';
import { betterStatus, currentPhase, isSuppressed } from '../sim/state.js';
import {
  agree, count, diceText, featureWord, hexes, hitsText, phaseName, ROLE_FULL, statusText, terrainWord, unitName as shortName,
} from '../text.js';

const pct = (p) => `${Math.round(p * 100)}%`;
const inSix = (need) => `${7 - Math.min(6, Math.max(1, need))} из 6`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const roles = (list) => list.map((r) => ROLE_FULL[r] ?? r).join(', ');
const hexesAway = (n) => `в ${count(n, 'гексе', 'гексах', 'гексах')}`;

// A unit with its side: «OPFOR ALPHA», «BLUFOR SL».
export function unitName(u) {
  return `${u.side} ${shortName(u)}`;
}

// Known enemies (spotted or suspected) that have line of sight to hex h.
function knownWatching(state, side, h) {
  return knownEnemies(state, side).filter((c) => lineOfSight(state.map, state.balance, c.pos, h).clear);
}

// Whether a unit ending its move on h will be seen, from what its side knows.
function exposureNote(state, u, h, fast) {
  const watching = knownWatching(state, u.side, h);
  const concealed = terrainOf(state.map, state.balance, h).concealing;
  if (!watching.length) {
    return concealed ? ' Закончит скрытно.' : ' Закончит на открытом месте; известный противник это место не видит.';
  }
  const who = watching.map((c) => `${c.level === 'spotted' ? 'противник' : 'предполагаемый противник'} на ${key(c.pos)}`).join(', ');
  if (!concealed || fast) return ` Будет на виду (${who}): заметят.`;
  return ` В поле зрения (${who}), но в укрытии: заметят, только если противник рядом.`;
}

// «остаётся на месте» where the phase allows moving, else «не стреляет».
function holdWord(state, name = currentPhase(state).name) {
  const phase = state.balance.turn.phases.find((p) => p.name === name);
  return phase?.actions?.includes('move') ? 'остаётся на месте' : 'не стреляет';
}

function leaderNote(state, r) {
  return r.leader === null ? 'SL нет' : `${shortName(state.units[r.leader])} ${hexesAway(r.distance)}`;
}

// What the rally phase will do for a suppressed or pinned unit, or null.
export function rallyPreview(state, u) {
  if (!isSuppressed(u) || u.status === 'eliminated') return null;
  const r = rallyNeed(state, u);
  const to = statusText(u, betterStatus(u.status));
  const name = shortName(u);
  if (r.auto) return `Восстановление: ${name} — «${to}», без броска (${shortName(state.units[r.leader])} рядом).`;
  if (r.blocked) return `Восстановление: ${name} не придёт в себя — противник рядом, а SL нет.`;
  return `Восстановление: ${name} нужно ${r.need}+ на кубике, чтобы стать «${to}»: ${inSix(r.need)} (${pct(chanceAtLeast(r.need))}; ${leaderNote(state, r)}).`;
}

const signed = (m) => `${m.mod > 0 ? '+' : ''}${m.mod} ${m.why}`;

// «4 база, +2 за бруствером (сторона ЮВ), +1 дальность 4 гекса»
function modText(f, sol) {
  return [`${f.baseTn} база`, ...sol.mods.map(signed)].join(', ')
    + (sol.rawTn !== sol.tn ? `, ${sol.rawTn}+ — не хуже ${sol.tn}+` : '');
}

// The fire preview: dice, target number with its reasons, and the exact odds.
// On a hex with no spotted enemy nothing about who may be there is used
// beyond the map: the odds are for a full team that is not suppressed.
export function firePreview(state, u, h, sol = fireSolution(state, u, h)) {
  const name = shortName(u);
  if (!sol.ok) return `${name}: туда стрелять нельзя — ${sol.reason}.`;
  const t = sol.aimed ? state.units[sol.target] : null;
  const odds = fireOdds({
    dice: sol.dice, tn: sol.tn, casualtyOn: sol.cover.casualtyOn,
    pinAt: pinAt(state.balance, t ? t.status : 'ok'), soldiers: t ? t.soldiers.length : state.balance.unit.roles.length,
  });
  const ground = terrainWord(terrainName(state.map, h));
  const head = t
    ? `${name} ведёт огонь по ${unitName(t)} на ${key(h)} (${ground})`
    : `${name} ведёт огонь на подавление по ${key(h)} (${ground}), обнаруженного противника там нет`;
  const ifThere = t ? '' : ' Если там группа:';
  return `${head}: ${diceText(sol.dice)}, попадание на ${sol.tn}+ (${modText(state.balance.fire, sol)}).${ifThere}`
    + ` ${pct(odds.anyHit)} — хотя бы одно попадание, ${pct(odds.pin)} — прижать. Потери на ${sol.cover.casualtyOn}+ (${describeCoverShort(sol)}), в среднем ${odds.expectedCasualties.toFixed(2)}.`;
}

// The same preview as figures, for the hex card. Null when the unit cannot fire there.
export function fireFigures(state, u, h, sol = fireSolution(state, u, h)) {
  if (!sol.ok) return null;
  const t = sol.aimed ? state.units[sol.target] : null;
  const odds = fireOdds({
    dice: sol.dice, tn: sol.tn, casualtyOn: sol.cover.casualtyOn,
    pinAt: pinAt(state.balance, t ? t.status : 'ok'), soldiers: t ? t.soldiers.length : state.balance.unit.roles.length,
  });
  return {
    target: t ? unitName(t) : null, dice: sol.dice, tn: sol.tn, mods: modText(state.balance.fire, sol),
    casualtyOn: sol.cover.casualtyOn, cover: describeCoverShort(sol),
    anyHit: pct(odds.anyHit), pin: pct(odds.pin), expected: odds.expectedCasualties.toFixed(2),
  };
}

// The assault preview as figures, for the hex card. Null when the unit cannot assault there.
export function assaultFigures(state, u, h) {
  const sol = assaultSolution(state, u, h);
  if (!sol.ok) return null;
  const d = state.units[sol.defender];
  const o = assaultOdds(sol);
  return {
    defender: unitName(d), status: statusText(d), dice: sol.attackDice, tn: sol.attackTn,
    defendDice: sol.defendDice, defendTn: sol.defendTn, take: pct(o.take), wiped: o.attackerDestroyed >= 0.005 ? pct(o.attackerDestroyed) : null,
    losses: o.expectedAttackerLosses.toFixed(2), kills: o.expectedDefenderLosses.toFixed(2),
  };
}

function describeCoverShort(sol) {
  return sol.cover.source === 'hexside' ? `${featureWord(sol.cover.feature)} со стороны стрелка` : terrainWord(sol.cover.terrain);
}

// The assault preview: both sides' dice and target numbers, the exact
// chance to take the hex, and the expected losses.
export function assaultPreview(state, u, h) {
  const name = shortName(u);
  const sol = assaultSolution(state, u, h);
  if (!sol.ok) return `${name}: туда штурмовать нельзя — ${sol.reason}.`;
  const d = state.units[sol.defender];
  const o = assaultOdds(sol);
  const atk = [`противник ${statusText(d)}`, ...sol.attackMods.map(signed)].join(', ');
  const def = sol.defendDice
    ? `${unitName(d)}: ${diceText(sol.defendDice)}, попадание на ${sol.defendTn}+ (${[`${state.balance.assault.defendTn} база`, ...sol.defendMods.map(signed)].join(', ')}).`
    : `${unitName(d)} ${statusText(d, 'pinned')} и не может отвечать.`;
  const wiped = o.attackerDestroyed >= 0.005 ? ` ${pct(o.attackerDestroyed)}, что ${name} ${statusText(u, 'eliminated')}.` : '';
  return `${name} штурмует ${unitName(d)} на ${key(h)} (${terrainWord(terrainName(state.map, h))}, ${statusText(d)}): ${name} — ${diceText(sol.attackDice)}, попадание на ${sol.attackTn}+ (${atk}); ${def}`
    + ` ${pct(o.take)} — взять гекс; иначе ${name} откатится, ${statusText(u, 'pinned')}.${wiped}`
    + ` Ожидаемые потери: ${name} ${o.expectedAttackerLosses.toFixed(2)}, ${unitName(d)} ${o.expectedDefenderLosses.toFixed(2)}.`;
}

// One line saying what the action will do, or why it cannot be done.
export function previewAction(state, action) {
  const check = validateAction(state, action);
  const u = state.units[action.unit];
  const name = shortName(u);
  if (!check.ok) return `${name}: так нельзя — ${check.reason}.`;
  const where = (h) => `${key(h)} (${terrainWord(terrainName(state.map, h))})`;
  if (assaultVia(state, action)) return assaultPreview(state, u, action.type === 'move' ? action.to : action.target);
  switch (action.type) {
    case 'move':
      return `${name} выдвигается на 1 гекс: ${where(action.to)}.${exposureNote(state, u, action.to, false)}`;
    case 'fastMove': {
      const end = action.path[action.path.length - 1];
      const her = agree(u, { team: 'её', leader: 'его' });
      return `${name} делает перебежку на ${hexes(action.path.length)}: ${where(end)}. До своего следующего хода на виду: ${her} легче заметить и поразить.${exposureNote(state, u, end, true)}`;
    }
    case 'fire': {
      if (!action.second) return firePreview(state, u, action.target);
      const [a, b] = fireSolutions(state, u, action);
      return `Огонь разделён. ${firePreview(state, u, action.target, a)} ${firePreview(state, u, action.second, b).replace(`${name} `, 'И ')}`;
    }
    case 'pass':
      return `${name} ${holdWord(state)}.`;
    default:
      return '';
  }
}

// Log line for an event, or null for events not worth a line. With a viewer
// side, only what that side knows is told: its own units, enemies it has
// spotted, and its own contacts.
export function eventText(state, e, viewer = null) {
  const u = e.unit !== undefined ? state.units[e.unit] : null;
  if (viewer && ['spotted', 'lost', 'contact_dropped', 'contact_moved'].includes(e.type)) {
    if (e.side !== viewer) return null;
    const name = unitName(u);
    if (e.type === 'spotted') return `КОНТАКТ: ${name} на ${key(e.pos)} (${e.why}); заметила ${shortName(state.units[e.by])}.`;
    if (e.type === 'lost') return `${name} потерян из виду. Последний раз — на ${key(e.pos)}.`;
    if (e.type === 'contact_moved') return null;
    return `Предполагаемая позиция на ${key(e.pos)} снята (${e.why}).`;
  }
  if (viewer && e.type === 'fire') return fireText(state, e, viewer);
  if (e.type === 'assault') return assaultText(state, e);
  if (viewer && u && u.side !== viewer) {
    // Enemy actions: only moves and recovery of an enemy the viewer can see.
    if (!['moved', 'recover'].includes(e.type) || state.contacts?.[viewer]?.[u.id]?.level !== 'spotted') return null;
  }
  switch (e.type) {
    case 'activated':
      return null;
    case 'moved':
      return `${unitName(u)} выдвигается на ${key(e.to)}.`;
    case 'fire':
      return fireText(state, e, null);
    case 'rally':
      if (e.blocked) return `${unitName(u)} не может прийти в себя: противник рядом, SL нет. По-прежнему ${statusText(u, e.from)}.`;
      if (e.auto) return `${unitName(u)} приходит в себя рядом с ${shortName(state.units[e.leader])}: теперь ${statusText(u, e.to)}.`;
      return `${unitName(u)}: бросок ${e.roll} на восстановление (нужно ${e.need}+, ${leaderNote(state, e)}): ${e.success ? `теперь ${statusText(u, e.to)}` : `по-прежнему ${statusText(u, e.from)}`}.`;
    case 'recover':
      return `${unitName(u)} приходит в себя вместо действий: теперь ${statusText(u, e.to)}.`;
    case 'turn_end':
      return `Конец хода ${e.turn}.`;
    case 'game_over':
      return `ЗАДАЧА ЗАВЕРШЕНА: победа ${e.winner}. ${cap(e.why)}.`;
    case 'turn_start':
      return `Ход ${e.turn}.`;
    case 'phase_start':
      return phaseText(e, viewer);
    case 'rejected':
      return `Не выполнено: ${e.reason}.`;
    default:
      return null;
  }
}

export function phaseLabel(name) {
  return phaseName(name);
}

// Whether the enemy has anyone able to act is not the viewer's to know.
function phaseText(e, viewer = null) {
  const label = `Фаза «${phaseName(e.name)}» (${e.side})`;
  return e.idle && (!viewer || viewer === e.side) ? `${label}: действовать некому.` : `${label}.`;
}

export function passText(state, e, viewer = null) {
  if (e.type !== 'activated' || e.action !== 'pass') return null;
  if (viewer && state.units[e.unit].side !== viewer) return null;
  return `${unitName(state.units[e.unit])} ${holdWord(state, e.phase)}.`;
}

// The fire line: always the dice; the effect only if the viewer can see the
// target (or it is the viewer's own unit). Enemy fire is told when it hits
// the viewer's units or the viewer can see the shooter.
export function fireText(state, e, viewer) {
  const shooter = state.units[e.unit];
  const target = e.target === null ? null : state.units[e.target];
  const known = (u) => !viewer || u.side === viewer || state.contacts?.[viewer]?.[u.id]?.level === 'spotted';
  const mine = !viewer || shooter.side === viewer;
  const atMe = target && viewer && target.side === viewer;
  if (!mine && !atMe && !known(shooter)) return null;
  const who = mine || known(shooter) ? unitName(shooter) : 'Невидимый противник';
  const kind = e.aimed ? 'ведёт огонь по' : 'ведёт огонь на подавление по';
  const dice = `нужно ${e.tn}+, выпало ${e.dice.join(' ')}: ${e.hits ? hitsText(e.hits) : 'попаданий нет'}`;
  let effect = '';
  if (e.hits && target && (e.aimed || known(target))) {
    const rolls = e.casualtyRolls.map((c) => c.roll).join(' ');
    const lost = e.lost.length ? `потери: ${roles(e.lost)}` : 'без потерь';
    effect = e.eliminated
      ? ` ${unitName(target)} ${statusText(target, 'eliminated')} (броски на потери ${rolls}, нужно ${e.casualtyOn}+ ${e.cover}).`
      : ` ${unitName(target)}: ${statusText(target, e.statusTo)}; броски на потери ${rolls} (нужно ${e.casualtyOn}+, ${e.cover}): ${lost}.`;
  } else if (e.hits) {
    effect = ' Видимого эффекта нет.';
  }
  return `${who} ${kind} ${key(e.hex)}: ${dice}.${effect}`;
}

const RESULT_TEXT = {
  taken: (a, d) => `${unitName(a)} берёт гекс; ${unitName(d)} ${statusText(d, 'eliminated')}.`,
  repulsed: (a, d) => `${unitName(d)} держится; ${unitName(a)} откатывается, ${statusText(a, 'pinned')}.`,
  'attacker destroyed': (a, d) => `${unitName(a)} ${statusText(a, 'eliminated')}; ${unitName(d)} держится.`,
  'both destroyed': (a, d) => `${unitName(a)} и ${unitName(d)} уничтожены.`,
};

// Close combat is seen by both sides.
export function assaultText(state, e) {
  const a = state.units[e.unit];
  const d = state.units[e.defender];
  const hits = (rolls, tn) => rolls.filter((r) => r >= tn).length;
  const def = e.defendRolls.length
    ? `${unitName(d)}: нужно ${e.defendTn}+, выпало ${e.defendRolls.join(' ')} (${hitsText(hits(e.defendRolls, e.defendTn))})`
    : `${unitName(d)} ${statusText(d, 'pinned')}, ответить не может`;
  return `${unitName(a)} штурмует ${unitName(d)} на ${key(e.hex)}: ${unitName(a)}: нужно ${e.attackTn}+, выпало ${e.attackRolls.join(' ')} (${hitsText(hits(e.attackRolls, e.attackTn))}); ${def}. ${assaultSummary(state, e)}`;
}

// Losses and the outcome of an assault, without the dice.
export function assaultSummary(state, e) {
  const a = state.units[e.unit];
  const d = state.units[e.defender];
  const lost = [e.defenderLost.length ? `${unitName(d)} теряет: ${roles(e.defenderLost)}` : null, e.attackerLost.length ? `${unitName(a)} теряет: ${roles(e.attackerLost)}` : null].filter(Boolean);
  const overrun = e.overrun.length ? ` Смяты: ${e.overrun.map((id) => unitName(state.units[id])).join(', ')}.` : '';
  return `${lost.length ? `${lost.join('; ')}. ` : ''}${RESULT_TEXT[e.result](a, d)}${overrun}`;
}

// What a fire did, as the viewer can know it, without the dice: «2 попадания. OPFOR ALPHA: прижата; ...».
export function fireSummary(state, e, viewer) {
  const line = fireText(state, e, viewer) ?? '';
  return cap(line.replace(/^.*?выпало [\d ]+: /, ''));
}
