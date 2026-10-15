import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyAction } from '../src/sim/actions.js';
import { createRng } from '../src/sim/rng.js';
import { commitOrders } from '../src/sim/orders.js';
import { eventText, passText, previewAction, rallyPreview } from '../src/ui/describe.js';
import { hitsText } from '../src/text.js';
import { H, makeState, open, toPhase, unit } from './helpers.js';

function squad() {
  return makeState(open(8, 8), [
    unit('BLUFOR', 'SL', 3, 6, { kind: 'leader' }), unit('BLUFOR', 'ALPHA', 3, 5), unit('OPFOR', 'ALPHA', 3, 0),
  ]);
}

test('previews say what will happen, with the odds for dice', () => {
  const s = squad();
  assert.match(previewAction(s, { type: 'move', unit: 1, to: H(3, 4) }), /ALPHA выдвигается на 1 гекс: 3,4 \(поле\)/);
  assert.match(previewAction(s, { type: 'fastMove', unit: 1, path: [H(3, 4), H(3, 3)] }), /перебежку на 2 гекса: .* До своего следующего хода на виду/);
  assert.equal(previewAction(s, { type: 'pass', unit: 1 }), 'ALPHA остаётся на месте.');
  s.units[1].status = 'pinned';
  assert.match(previewAction(s, { type: 'move', unit: 1, to: H(3, 4) }), /так нельзя — ALPHA прижата и не может двигаться/);
});

test('the rally phase is previewed with its odds', () => {
  const s = squad();
  s.units[1].status = 'pinned';
  s.units[1].pos = H(3, 4); // 2 hexes from the SL
  assert.equal(rallyPreview(s, s.units[1]), 'Восстановление: ALPHA нужно 3+ на кубике, чтобы стать «подавлена»: 4 из 6 (67%; SL в 2 гексах).');
  s.units[1].pos = H(3, 6);
  assert.match(rallyPreview(s, s.units[1]), /ALPHA — «подавлена», без броска \(SL рядом\)/);
  assert.equal(rallyPreview(s, s.units[0]), null, 'not suppressed');
});

test('log lines report the dice and the phases', () => {
  const s = squad();
  s.units[1].status = 'pinned';
  const r = commitOrders(toPhase(s, 'firefight'), [], createRng(4));
  const e = r.events.find((x) => x.type === 'rally');
  assert.match(eventText(r.state, e), new RegExp(`ALPHA: бросок ${e.roll} на восстановление \\(нужно 2\\+, SL в 1 гексе\\)`));
  const lines = r.events.map((x) => passText(s, x, 'BLUFOR') ?? eventText(r.state, x, 'BLUFOR')).filter(Boolean);
  assert.ok(lines.includes('BLUFOR SL не стреляет.'), lines.join(' | '));
  assert.ok(lines.includes('Фаза «Восстановление» (BLUFOR).'));
  assert.ok(lines.includes('Фаза «Ход противника» (OPFOR).'));
});


test('the log only tells BLUFOR what it knows', () => {
  // OPFOR in a trench, unseen: its hold and its moves stay out of BLUFOR's log.
  let s = makeState(['...nn..', '.......', '.......', '.......', '.......'], [
    unit('BLUFOR', 'ALPHA', 3, 4), unit('OPFOR', 'ALPHA', 3, 0),
  ]);
  s = toPhase(s, 'enemy action');
  const r = applyAction(s, { type: 'move', unit: 1, to: H(4, 0) }, createRng(1));
  for (const e of r.events) {
    const line = eventText(r.state, e, 'BLUFOR') ?? '';
    assert.ok(!/OPFOR ALPHA выдвигается/.test(line), line);
  }
  assert.equal(passText(s, { type: 'activated', action: 'pass', unit: 1 }, 'BLUFOR'), null);
});

test('the move preview warns when the destination is in view of a known enemy', () => {
  const s = makeState(open(8, 6), [unit('BLUFOR', 'ALPHA', 3, 5), unit('OPFOR', 'ALPHA', 3, 0)]);
  assert.match(previewAction(s, { type: 'move', unit: 0, to: H(3, 4) }), /Будет на виду \(противник на 3,0\): заметят/);
  const hidden = makeState(['........', '........', '........', '...:....', '........', '........'], [unit('BLUFOR', 'ALPHA', 3, 4), unit('OPFOR', 'ALPHA', 3, 0)]);
  assert.match(previewAction(hidden, { type: 'move', unit: 0, to: H(3, 3) }), /но в укрытии: заметят, только если противник рядом/);
});

// ---- fire ----

const TRENCH = ['........', '........', '...n....', '........', '........', '........'];
const PARAPETS = [{ hex: [3, 2], sides: ['SW', 'SE'], feature: 'parapet' }];

test('the fire preview gives dice, TN with its reasons, and the exact odds', () => {
  const s = toPhase(makeState(open(8, 6), [unit('BLUFOR', 'ALPHA', 3, 5), unit('OPFOR', 'ALPHA', 3, 1)]), 'firefight');
  const line = previewAction(s, { type: 'fire', unit: 0, target: H(3, 1) });
  assert.equal(line, 'ALPHA ведёт огонь по OPFOR ALPHA на 3,1 (поле): 5 кубиков, попадание на 5+ (4 база, +1 дальность 4 гекса). 87% — хотя бы одно попадание, 54% — прижать. Потери на 4+ (поле), в среднем 0.83.');
});

test('suppressive fire preview names nobody', () => {
  const s = toPhase(makeState(TRENCH, [unit('BLUFOR', 'ALPHA', 3, 5), unit('OPFOR', 'ALPHA', 3, 2)], 1, PARAPETS), 'firefight');
  const line = previewAction(s, { type: 'fire', unit: 0, target: H(3, 2) });
  assert.match(line, /^ALPHA ведёт огонь на подавление по 3,2 \(окоп\), обнаруженного противника там нет: 5 кубиков, попадание на 6\+/);
  assert.ok(!/OPFOR/.test(line));
});

test('the log shows the dice, and the effect only on a target the player can see', () => {
  const s = toPhase(makeState(TRENCH, [unit('BLUFOR', 'ALPHA', 3, 5), unit('OPFOR', 'ALPHA', 3, 2)], 1, PARAPETS), 'firefight');
  let checked = 0;
  for (let seed = 1; seed <= 200 && checked < 3; seed++) {
    const r = applyAction(s, { type: 'fire', unit: 0, target: H(3, 2) }, createRng(seed));
    const e = r.events.find((x) => x.type === 'fire');
    if (!e.hits) continue;
    const line = eventText(r.state, e, 'BLUFOR');
    assert.match(line, new RegExp(`^BLUFOR ALPHA ведёт огонь на подавление по 3,2: нужно 6\\+, выпало ${e.dice.join(' ')}: ${hitsText(e.hits)}\\. Видимого эффекта нет\\.$`));
    assert.match(eventText(r.state, e, 'OPFOR'), /OPFOR ALPHA: (подавлена|прижата)/, 'OPFOR knows it was hit');
    checked++;
  }
  assert.equal(checked, 3);
});

test('whether the enemy can act in its phase is not shown to the player', () => {
  const e = { type: 'phase_start', name: 'enemy action', side: 'OPFOR', idle: true };
  assert.equal(eventText(null, e, 'BLUFOR'), 'Фаза «Ход противника» (OPFOR).');
  assert.equal(eventText(null, { ...e, side: 'BLUFOR', name: 'firefight' }, 'BLUFOR'), 'Фаза «Огонь» (BLUFOR): действовать некому.');
});

test('the split fire preview gives both halves with their own dice and odds', () => {
  const s = toPhase(makeState(open(8, 6), [unit('OPFOR', 'ALPHA', 3, 1), unit('BLUFOR', 'ALPHA', 3, 5), unit('BLUFOR', 'BRAVO', 6, 2)]), 'enemy action');
  const line = previewAction(s, { type: 'fire', unit: 0, target: H(3, 5), second: H(6, 2) });
  assert.match(line, /^Огонь разделён\. ALPHA ведёт огонь по BLUFOR ALPHA на 3,5 \(поле\): 3 кубика, попадание на 5\+/);
  assert.match(line, /И ведёт огонь по BLUFOR BRAVO на 6,2 \(поле\): 2 кубика/);
});
