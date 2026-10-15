# Fix and Flank: handoff README

This file is for the agent (and person) taking over the project. Read it first, then `CLAUDE.md` (the project rules, which Claude Code loads automatically) and `docs/decisions.md` (why things are the way they are).

## What it is

A turn-based hex wargame of small-unit infantry tactics that runs in the browser. Modern setting, dismounted infantry, squad scale: a BLUFOR squad (two fireteams and a squad leader) attacks a dug-in OPFOR. The game teaches the **fix and flank** drill: pin the enemy with a base of fire, move a second element round the flank under cover, finish with an assault. A frontal assault on a dug-in enemy should usually fail.

It is made for a community of **Arma Reforger** players, so terminology and tactics should feel familiar, and it should double as a place to rehearse squad drills. Format reference: *Take That Hill* (hexes, fireteam counters, d6 dice, few orders, the four-phase turn). Feel reference: *Brothers in Arms* (fix, flank, finish).

## Goals

1. **Fix and flank is the optimal strategy.** If a frontal assault ever beats an entrenched enemy, the balance is wrong. This is tested automatically (see Balance).
2. **Dice, never hidden dice.** Every roll is d6. Before committing, the player sees the target number, its reasons and the exact odds; after, the actual dice (tumbling in a dice tray, then settling) and what they did.
3. **Turn-based, in phases.** Each turn: Movement, Firefight, Rally (automatic), Enemy action. In each of their phases the player orders every unit, then commits; orders run in the order given.
4. **Small and readable.** Few units, three orders (Move, Fast move, Fire), NATO-style counters, flat hexes.
5. **Real tactics, abstract presentation.** Correct doctrine and words (base of fire, suppress, bound, flank, assault). No invented superweapons, no real-world IP (generic BLUFOR/OPFOR).
6. **Fair AI.** The enemy sees only what its side has spotted and plays by the rules (one exception the user asked for: only OPFOR may split its fire).

Not a goal any more: an after-action replay. It was planned (old milestone 8) and dropped by the user on 2026-10-14; the dice tray and the log cover seeing the rolls.

## Status

Milestones 1-7 of `CLAUDE.md` are done and pass their acceptance checks. Milestone 8 (replay) is dropped. Next is **milestone 9, content**: more missions, difficulty levels, terrain.

What works:

- Hex map from JSON (50 m hexes, odd-r offset rows), terrain table, hexside walls/hedges/parapets with **directional cover**.
- Fireteams (4 soldiers: TL, AR, GRN, RFL; AR rolls two dice and is lost last), the squad leader (SL), and an **HMG team** unit type (kept for harder missions; only on the training map).
- The four-phase turn; rally phase driven by distance to the SL; enemy recovery.
- Line of sight, fog of war, spotted / suspected contacts, known positions.
- Fire with d6 (target numbers from range, cover, exposure, suppression, suppressive fire), suppression and pinning, casualties against cover; split fire for OPFOR.
- Assault (close combat), with exact odds.
- Enemy AI with modes (hold, engage, split fire, counterattack, reposition, retreat, recover).
- Mission 1, "Trench Line", with win/loss rules (no turn limit: turns are counted, the fight goes on until a side wins); the automated balance test.
- Browser UI in the look of the Tactical Shift apps (TS Hub, Ops Planner, Mission Builder): dark panels floating over a full-window map, mission briefing and debrief dialogs, a hex card docked bottom right (the hex under the pointer: terrain, cover, hexsides, units, and the dice and odds of the order a click would give), phase track, roster cards, dice tray and bang markers, step-by-step playback. Line of sight (V) dims what the squad cannot see, or the selected unit when one is.
- The board in 3D, the only map view: a low-poly diorama in three.js (terrain, trees, farms, walls, hedges, the trench), a figure per soldier under each counter, turnable camera.
- A map editor (`editor.html`, the pencil in the game's top bar): map size, terrain painting with a palette and brush, a random-terrain button, walls and hedges drawn corner to corner along hex edges, parapets on hex sides, the BLUFOR start (ALPHA and the SL there, BRAVO beside them), the objective and up to four OPFOR teams, the briefing, undo and redo, all in 3D. Play saves the map in the browser (My maps) and opens it in the game; maps also export and import as JSON in the `data/maps` format.

## Run and test

No dependencies, no build step. Node 22 or newer.

```bash
npm start            # static server on http://localhost:8080 (tries the next port if taken)
npm test             # all tests, about 6 s, including the 200-seed balance test
npm run balance      # win rates of the scripted plans and how the games ended
npm run balance -- 400 201   # 400 runs from seed 201
```

URL options: `?map=training` (sandbox map, never ends, has the HMG), `?map=local:<id>` (a map saved from the editor in this browser), `?seed=2` (other dice), `?reveal=1` (debug: draw unseen OPFOR faintly).

Controls: left click one of your units (its counter or its soldiers; hovering one lights it and says "click to select"), then a hex (blue: move, yellow: fast move, red ring: assault; in the firefight any shaded hex: fire). Point at a hex for its card. Right click or Esc deselects. Space commits the phase, Tab next unit, H hold, V line of sight, Home fit, F1 help. The view: left or right drag or the arrow keys move it, middle drag or Q / E turns it, the wheel zooms.

## Layout

```
index.html            the game page: panel and dialog markup
editor.html           the map editor page
assets/ui.css         styles of both pages (the TS apps' dark look)
assets/fonts/         Roboto, Roboto Slab, Roboto Mono (UI; OFL / Apache 2.0) and Barlow, Barlow Condensed (counters; OFL)
assets/icons/         ts-mark.svg (Tactical Shift logo, from TS Hub)
data/balance.json     every tunable number: terrain, hexsides, fire, assault, rally, AI, unit types, phases
data/maps/            trenchline.json (mission 1, the default), training.json (sandbox)
src/sim/              pure rules: no DOM, no Math.random, deterministic
  state.js            state shape, unitType(), canActivate(), mayFire()
  actions.js          validateAction(), applyAction() (the step function), moveOptions()
  orders.js           commitOrders(state, actions, rng, onStep?), projectOrders(), checkPlan()
  phases.js           the turn sequence, rally phase, enemy recovery, phase skipping
  combat.js           fire: fireSolution(s), splitFire(), resolveFire()
  assault.js          close combat: assaultSolution(), resolveAssault()
  odds.js             exact odds (binomials) for previews, AI and tests
  los.js, spotting.js line of sight, contacts, fog
  cover.js, map.js, hex.js, dice.js, rng.js (mulberry32), mission.js (win/loss)
src/editor/           model.js (the map being edited as plain data: paint, resize, randomize, hex-edge paths,
                      forces, to and from the map JSON; no DOM, tested), editor.js (page: drawing, tools, undo),
                      store.js (My maps and the draft in localStorage; the game reads ?map=local: maps from it)
src/ai/basic.js       OPFOR AI: planOrders() / chooseOrders()
src/ai/drills.js      scripted BLUFOR plans (frontal, fix and flank) for the balance test; playOut()
src/render/           world3d.js (the board in 3D: low-poly geometry built from the map, figures, effects,
                      and the camera), hexmap.js (marks, counters and bangs, drawn on canvases the 3D view uses:
                      the marks layer its ground shader lays over the terrain, counter and bang textures),
                      camera.js (the flat frame those canvases are drawn in)
vendor/three/         three.js 0.186.1 (MIT)
src/ui/               app.js (input, panel, playback), describe.js (previews and log text), dice.js (tray), anim.js
scripts/              serve.js (static server), balance.js (balance report)
tests/                node --test suites; helpers.js builds small maps from strings
docs/decisions.md     every rule choice and change, with the reason
```

How a turn flows: the UI collects a plan (one order per unit), checks it with `checkPlan` (each order against the projection of the ones before), then `commitOrders` runs it with a seeded RNG and reports each step through `onStep`. The UI plays the steps back: dice tray, bangs, then the step's state on the map and its log lines, then moves. When the phase passes to OPFOR, `chooseOrders` plans and the same happens. Everything the UI shows comes from the sim's events and states; the UI never decides an outcome.

## Rules of thumb for this repo (from CLAUDE.md)

- Keep `src/sim` headless and deterministic; run `npm test` after every change to `src/sim` or `src/ai`.
- **No magic numbers in code**: tunables go in `data/balance.json`.
- When balance feels off, change `balance.json`, not code, and re-run the balance test.
- When a rule is ambiguous, pick the simplest option, write it in `docs/decisions.md`, continue.
- No dependencies, frameworks or build step without asking. No network calls at runtime (fonts are bundled).
- UI text: plain, infantry vocabulary, no filler.
- Small commits, one concern each.

## Balance

Acceptance (milestone 7), automated in `tests/balance.test.js`: over 200 seeded runs of mission 1 against the AI, a scripted frontal assault wins **under 25%** and a scripted fix-and-flank plan **over 70%**.

Current, seeds 1-200: frontal **3.5%**, fix and flank **97.0%** (average win on turn 14.4); seeds 201-400: frontal 1.5%, fix and flank 99.0%. Since the turn limit went (2026-10-15) a patient fix and flank nearly always wins in the end; the frontal rush still almost never does. Before that, with 12 turns: frontal 0-1%, fix and flank 74.5-83%.

The scripted plans live in `src/ai/drills.js`; their mission-specific hexes (routes, base-of-fire position, assault position) are in the map's `drills` entry. Any change to rules, the AI, `balance.json` or the map can move these numbers; `npm test` fails if a target is missed.

Assault odds against a full dug-in team (attacker full strength): defender ok 20%, suppressed 74%, pinned 99%.

## Known issues and fixes needed

Found in an audit on 2026-10-14 (all tests green; no console errors in a full browser playthrough). In rough order of priority:

**Bugs / gaps in the UI**

1. **No mission picker.** The debrief (end of game) has New game (new dice) and Same dice, but missions are still only the `?map=` URL parameter (`src/main.js`); maps made in the editor open from its Play button or its My maps list.
2. ~~Roster shows "ready" after the mission is over.~~ Fixed: once the game has ended the roster shows only lasting states (suppressed, pinned, eliminated).
3. **Playback cannot be skipped or sped up.** Each roll takes about 2 s (`DICE_ROLL_MS`, `DICE_HOLD_MS` in `src/ui/app.js`); a firefight with several shots plus the enemy's fire is slow to watch. Add Space/click to skip to the result and/or a speed setting.
4. **Touch input is incomplete.** Pointer events work for tapping, but there is no pinch zoom, and right-click (deselect) has no touch equivalent. Desktop first was the brief; worth doing before sharing widely.
5. **Unit "reload" coupling is fragile.** Every unit gets `reload = fireEveryTurns` when it fires and counts down at its side's next turn start; the UI hides the harmless "reloading" of rifle teams by checking `fired` (`reloading()` in `app.js`). Cleaner: store the turn the unit may fire again.

**Rules and AI to review (design questions, not crashes)**

6. **Assault on a pinned team is nearly certain (99%).** The rule "defender eliminated if it ends with fewer soldiers than the attacker" means one hit from an unhurt attacker wins. Pinning is meant to be decisive, but playtest it; the lever is `assault.attackTn.pinned` in `balance.json` (or the outcome rule in `assault.js` `assaultOutcome()`).
7. **The SL rallies himself automatically** (he is always "in his own hex"), so a suppressed SL always recovers in the rally phase. Probably fine; documented in `docs/decisions.md`.
8. **The AI never fires suppressively at suspected positions**, never bounds forward except when counterattacking, and has no difficulty levels yet. Milestone 9 asks for difficulty levels that change aggression and dice modifiers (`balance.ai`), never information.
9. **The HMG cannot do anything against an enemy in the next hex**: it never assaults, and fire into an adjacent enemy hex counts as an assault. Decide whether it may fire point-blank (would need an exception in `assaultVia()` / `validateAction()`).
10. **Blind-fire previews assume a full, unsuppressed fireteam** (the player cannot know who is there). Intentional; mention it in the UI text if players find it confusing.
11. **Frontal assault wins 0%**: the frontal script never stops to fire, so it is a pure rush. That satisfies the acceptance test; a "frontal with covering fire" script would be a more honest comparison if the balance is ever questioned.
12. **The balance test now measures who wins, not how fast.** Without a turn limit fix and flank wins 97-99%, so the 70% target no longer says much. A measure of cost (turns taken, men lost) would tell the plans apart better; the frontal target (under 25%) still holds with a wide margin.

**Housekeeping**

13. The mission 1 map was produced by a small generator script that is not in the repo; `data/maps/trenchline.json` is now the source of truth. Edit it by hand (or write a new generator under `scripts/`).
14. `tests/balance.test.js` runs 400 full games inside `npm test` (about 3 s). If the test suite grows slow, move it behind a separate script and keep it in CI.

## Suggested next work (milestone 9: content)

- Mission 2: two OPFOR teams, one dug in and one in depth or in a building, so OPFOR split fire and the BLUFOR HMG matter. Give it its own `drills` and its own balance targets.
- Difficulty levels (`balance.ai` presets: open-fire range, counterattack chance, assault thresholds, dice modifiers).
- New game / mission select screen (fixes issue 1).
- Terrain already in the table but barely used: rubble, buildings (a building fight).

## The handoff package

The package this README came in holds:

- `fix_and_flank/`: the source tree at the last commit (no build output, nothing to install).
- `fix_and_flank.bundle`: the full git history. Restore it with `git clone fix_and_flank.bundle fix_and_flank` (branch `main-3wu53y`), then `cd fix_and_flank && npm test`.
- The same branch is on GitHub: `OneScheer/fix_and_flank`, branch `main-3wu53y`.
