"""Build the hub's played games (db/seed/played-events.json) from the replay-stats reports.

Run from the repo root with the per-op reports (ts-wrapped: a month file holds one "# <date> — Статистика
операции — `CODE`" section per op; a per-op file is named <date>-<CODE>.md):

    py data/events/build_past_events.py ../ts-wrapped/september-2026/september-2026.md ../ts-wrapped/october-2026/stats/*.md

then load them with `npm run db:seed -- --update` in web/ (db/README.md).

The reports are the source of truth for the numbers. What they don't hold is kept in OPS below: the
mission (the replay's world file names it), the scheduled time, the plan and the platoon leader
(their Discord display name, which the seed matches to a player).
"""
import datetime as dt
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'db', 'seed', 'played-events.json')
MSK = dt.timezone(dt.timedelta(hours=3))

# date, replay codes, mission id, scheduled start (MSK), plan, platoon leader.
# Plan = the last planner push before the op whose markers sit where the op was played (no replay
# carries a /syncplan stamp yet). PL = the slotting bot's «Ком. взвода» / PL slot, when filled.
OPS = [
    ('2026-09-01', ['T2G8DM'], 'in-cold-blood', '20:00', None, None),
    ('2026-09-03', ['GC4JJ6'], 'show-must-go-on', '20:00', None, None),
    ('2026-09-04', ['9UCK4Y'], 'sawmill-raid', '20:30', 'LWL2UB', None),
    ('2026-09-06', ['QDW8FW', 'JE4RMN'], 'wolfs-nest', '19:00', '8CJEH2', None),
    ('2026-09-08', ['VNRQB8'], 'bite-the-dust', '20:00', 'QX2F2Y', None),
    ('2026-09-10', ['D5DCTD'], 'trench-crawlers', '20:00', None, None),
    ('2026-09-13', ['58HK3E'], 'endsieg', '19:00', 'AXVYNW', None),
    ('2026-09-15', ['4GS87F'], 'dvizhuha', '20:00', '3U8SEL', None),
    ('2026-09-17', ['VNVHSZ', 'A5BYRF'], 'bastion-of-death', '20:00', None, None),
    ('2026-09-20', ['BX3QAA'], 'circuit-breaker', '19:00', 'BQFKNZ', None),
    ('2026-09-22', ['VNG9BN'], 'marching-fire', '20:00', 'K9LNW8', None),
    # Second mission of the same evening.
    ('2026-09-22', ['S2RM53'], 'troubled-waters', '21:00', None, None),
    ('2026-09-24', ['6L239S'], 'regina-brawl', '20:00', '4FZKCK', None),
    ('2026-09-27', ['LW4AH8', '4BNRSS'], 'metal-gambit', '19:00', 'E8PMVU', None),
    ('2026-09-29', ['EXWZSN'], 'reverse-slope', '20:00', 'UQ2BWJ', None),
    ('2026-10-01', ['MCKFLK'], 'quiet-witness', '20:00', 'ALTHRY', None),
    ('2026-10-03', ['ERL7B9'], 'emerald-fields', '19:00', 'FESVGD', None),
    ('2026-10-04', ['JNCFEB'], 'counterpunch', '19:00', 'QXVTZ6', 'Smoker (OnlineKiller)'),
    ('2026-10-06', ['DFTZSB'], 'another-castle', '20:00', 'Q6W5N5', 'Galaxy'),
]
# Same evening as the usual slot, so not an extra op.
NOT_EXTRA = {('2026-09-22', 'troubled-waters')}

# First player_join per replay, epoch ms (ops_planner.replays: meta.startedAt * 1000 + the event's t).
# The report's duration runs from there to the last player activity.
FIRST_JOIN = {
    'T2G8DM': 1788281469504, 'GC4JJ6': 1788457056142, '9UCK4Y': 1788542016008, 'QDW8FW': 1788709356885,
    'JE4RMN': 1788713272576, 'VNRQB8': 1788885766410, 'D5DCTD': 1789059185436, '58HK3E': 1789314352787,
    '4GS87F': 1789490693545, 'VNVHSZ': 1789663450414, 'A5BYRF': 1789669922211, 'BX3QAA': 1789919209711,
    'VNG9BN': 1790095545771, 'S2RM53': 1790099951286, '6L239S': 1790268245010, 'LW4AH8': 1790523894648,
    '4BNRSS': 1790527789751, 'EXWZSN': 1790700192247, 'MCKFLK': 1790872930583, 'ERL7B9': 1791042327741,
    'JNCFEB': 1791128460355, 'DFTZSB': 1791305016752,
}

# Report achievement titles → the hub's award kinds (lib/types AwardKind), in the hub's display order.
AWARDS = {
    'Меткий стрелок': 'butcher',
    'Подрывник': 'demolitionist',
    'Ракетный хирург': 'rocketman',
    'Первая кровь': 'firstBlood',
    'Первопроходец того света': 'firstToDie',
    'Возвращенец': 'returnee',
    'Быстрое возвращение': 'notForLong',
    'Свой по своим': 'hitYourOwn',
    'Неприкасаемые': 'untouchables',
    'Крепкий орешек': 'toughNut',
}
ORDER = list(AWARDS.values())

TOTALS = {
    'Длительность': 'duration',
    'Игроков': 'players',
    'Выстрелов игроками': 'shots',
    'Выстрелов ИИ': 'aiShots',
    'Гранаты + подствольник (игроки)': 'grenades',
    'Ракеты (игроки)': 'rockets',
    'Погибло игроков': 'deaths',
    'Уничтожено ИИ': 'aiKilled',
    'PvP-убийства игроками': 'pvp',
    'Случаев дружественного огня': 'friendlyFire',
}
BOARDS = {'Убийства ИИ': 'aiKills', 'Смертей': 'deaths', 'Раз нокаутирован': 'knockdowns', 'Дружественный огонь': 'ff'}


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def seconds(s):
    """'1h 11m 45s' / '58m 02s' → seconds."""
    parts = dict((u, int(v)) for v, u in re.findall(r'(\d+)([hms])', s))
    return parts.get('h', 0) * 3600 + parts.get('m', 0) * 60 + parts.get('s', 0)


def names(s):
    return re.findall(r'`([^`]+)`', s)


def award_detail(kind, detail):
    n = int(m.group(1)) if (m := re.match(r'(\d+)', detail)) else 0
    if kind == 'butcher':
        return f"{n} {plural(n, 'убийство', 'убийства', 'убийств')} ИИ"
    if kind == 'demolitionist':
        return f"{n} {plural(n, 'граната', 'гранаты', 'гранат')} / подствольник"
    if kind == 'rocketman':
        return f"{n} {plural(n, 'ракета', 'ракеты', 'ракет')}"
    if kind == 'returnee':
        return f"{n} {plural(n, 'подъём', 'подъёма', 'подъёмов')} из нокаута"
    if kind == 'hitYourOwn':
        return f"{n} {plural(n, 'случай', 'случая', 'случаев')} дружественного огня"
    if kind == 'toughNut':
        return f"{n} {plural(n, 'нокаут', 'нокаута', 'нокаутов')}, ни одной смерти"
    if kind == 'notForLong':
        after = re.match(r'снова погиб через (.+?) после прошлой смерти', detail)
        return f'Снова погиб через {after.group(1)}' if after else detail
    if kind == 'untouchables':
        return 'Ни нокаута, ни смерти'
    return detail[:1].upper() + detail[1:]


def parse_op(lines, codes):
    op = {'codes': codes, 'totals': {}, 'roster': [], 'boards': {k: [] for k in BOARDS.values()}, 'awards': [],
          'parts': {}}
    section = board = None
    for line in lines:
        if line.startswith('## '):
            section, board = line[3:].strip(), None
            continue
        if line.startswith('### '):
            title = re.sub(r'^\W+', '', line[4:]).strip()
            board = BOARDS.get(title)
            if board is None:
                raise SystemExit(f'{codes}: unknown ranking "{title}"')
            continue
        if line.startswith('**Состав**'):
            op['roster'] = names(line)
            continue
        if line.startswith('**Длительность по реплеям**'):
            section, board = 'parts', None
            continue
        if not line.startswith('- '):
            continue
        if section == 'Итоги операции':
            m = re.match(r'- \S+ \*\*(.+?)\*\*: (.+)', line)
            key = TOTALS.get(m.group(1)) if m else None
            if key is None:
                raise SystemExit(f'{codes}: unknown total "{line}"')
            v = m.group(2).strip()
            op['totals'][key] = seconds(v) if key == 'duration' else int(v.replace(',', ''))
        elif section == 'parts':
            m = re.match(r'- `(\w+)` — (.+)', line)
            op['parts'][m.group(1)] = seconds(m.group(2))
        elif board == 'ff':
            m = re.match(r'- `([^`]+)` → (.+)', line)
            victim = names(m.group(2))
            op['boards']['ff'].append({'shooter': m.group(1), 'victim': victim[0] if victim else m.group(2).strip()})
        elif board:
            m = re.match(r'- `([^`]+)` — (\d+)', line)
            op['boards'][board].append({'playerName': m.group(1), 'value': int(m.group(2))})
        elif section == 'Достижения':
            m = re.match(r'- \S+ \*\*(.+?)\*\*(.*)', line)
            kind = AWARDS.get(m.group(1)) if m else None
            if kind is None:
                raise SystemExit(f'{codes}: unknown achievement "{line}"')
            rest = m.group(2)
            detail = re.search(r'\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*$', rest)
            op['awards'].append({
                'kind': kind,
                'players': names(rest),
                'detail': award_detail(kind, detail.group(1) if detail and kind != 'untouchables' else ''),
            })
    return op


def read_reports(paths):
    ops = {}
    for path in paths:
        text = open(path, encoding='utf-8').read()
        if re.search(r'^# \d{4}-\d\d-\d\d — ', text, re.M):
            # A month file: one section per op.
            for chunk in re.split(r'^(?=# \d{4}-\d\d-\d\d — )', text, flags=re.M):
                head = chunk.split('\n', 1)[0]
                if not re.match(r'# \d{4}-\d\d-\d\d — ', head):
                    continue
                codes = names(head)
                ops[tuple(codes)] = parse_op(chunk.split('\n')[1:], codes)
        else:
            codes = re.findall(r'\?replay=(\w+)', text) or [re.search(r'-(\w{6})\.md$', path).group(1)]
            ops[tuple(codes)] = parse_op(text.split('\n'), codes)
    return ops


def iso(ms):
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def build(reports):
    out = []
    for date, codes, mission, at, plan, pl in OPS:
        op = reports.get(tuple(codes))
        if op is None:
            raise SystemExit(f'no report for {date} {codes}')
        t = op['totals']
        y, mo, d = map(int, date.split('-'))
        hh, mm = map(int, at.split(':'))
        starts = dt.datetime(y, mo, d, hh, mm, tzinfo=MSK)
        usual = (starts.weekday(), hh, mm) in ((1, 20, 0), (6, 19, 0))
        # A restart splits an op into replays: it starts with the first one and ends with the last.
        last = codes[-1]
        last_len = op['parts'].get(last, t['duration']) if len(codes) > 1 else t['duration']
        out.append({
            'id': f'{date}-{mission}',
            'missionId': mission,
            'startsAt': iso(starts.timestamp() * 1000),
            'extra': not usual and (date, mission) not in NOT_EXTRA,
            **({'platoonLeader': pl} if pl else {}),
            'startedAt': iso(FIRST_JOIN[codes[0]]),
            'endedAt': iso(FIRST_JOIN[last] + last_len * 1000),
            'planCode': plan,
            'replays': codes,
            'attendance': op['roster'],
            'stats': {
                'totals': {
                    'deaths': t['deaths'],
                    'shots': t['shots'],
                    'aiShots': t['aiShots'],
                    'grenades': t['grenades'],
                    'rockets': t['rockets'],
                    'knockdowns': sum(e['value'] for e in op['boards']['knockdowns']),
                    'aiKilled': t['aiKilled'],
                    'friendlyFire': t['friendlyFire'],
                },
                'leaderboards': {'aiKills': op['boards']['aiKills'], 'deaths': op['boards']['deaths']},
                'awards': sorted(op['awards'], key=lambda a: ORDER.index(a['kind'])),
                'friendlyFire': op['boards']['ff'],
            },
        })
        if len(op['roster']) != t['players']:
            print(f"warning: {date} {mission}: roster {len(op['roster'])} ≠ players {t['players']}")
    out.sort(key=lambda e: e['startsAt'], reverse=True)
    return out


def main(paths):
    events = build(read_reports(paths))
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(events, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print(f'{len(events)} played games → {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
