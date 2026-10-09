"""Build the hub's mission seed (db/seed/missions.json) from missions.json plus missions-extra.json.

Run from the repo root:  py data/catalogue/build_seed.py
then load it into the database with `npm run db:seed` in web/ (see db/README.md).
Covers are expected at web/public/covers/<id>.jpg (Workshop images, downloaded once).
Authors are resolved to Discord display names through data/players/discord-members.json.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CAT = os.path.join(ROOT, 'data', 'catalogue', 'missions.json')
# Missions the Discord catalogue lacks, already in the seed's shape (authors as {name, discordId}).
EXTRA = os.path.join(ROOT, 'data', 'catalogue', 'missions-extra.json')
PLAYERS = os.path.join(ROOT, 'data', 'players', 'discord-members.json')
COVERS = os.path.join(ROOT, 'web', 'public', 'covers')
OUT = os.path.join(ROOT, 'db', 'seed', 'missions.json')

# Planner map keys → labels (ts-ops-planner web/src/lib/maps.ts)
MAPS = {'arland': 'Arland', 'everon': 'Everon', 'kolguyev': 'Kolguyev', 'zarichne': 'Zarichne', 'zargabad': 'Zargabad',
        'zimnitrita': 'Zimnitrita', 'serhiivka': 'Serhiivka', 'takistan': 'Takistan', 'ruha': 'Ruha', 'anizay': 'Anizay',
        'chernarus': 'Chernarus', 'faircroft': 'Faircroft Islands', 'armenhof': 'Armenhof', 'alhadra': 'Al Hadra',
        'seitenbuch': 'Seitenbuch', 'iraq1990': 'Iraq 1990', 'kunar': 'Kunar Province', 'merak': 'Merak',
        'mogadishu': 'Mogadishu', 'novka': 'Novka', 'westzagoria': 'West Zagoria'}


def main():
    if not os.path.exists(PLAYERS):
        sys.exit('data/players/discord-members.json is missing. It holds member data, so it stays out of git '
                 '(see data/players/README.md); build the seed on a machine that has it.')
    missions = json.load(open(CAT, encoding='utf-8'))
    names = {p['discordId']: p['displayName'] for p in json.load(open(PLAYERS, encoding='utf-8'))['players']}
    out = []
    for m in missions:
        w = m['workshop']
        cover = f"/covers/{m['id']}.jpg" if os.path.exists(os.path.join(COVERS, m['id'] + '.jpg')) else None
        sides = {k: v for k, v in m['sides'].items() if v}
        rec = {
            'id': m['id'],
            'name': m['title'],
            'mapKey': m['terrain'],
            'mapLabel': MAPS[m['terrain']],
            'coverUrl': cover,
            'authors': [{'name': names.get(a['discordId'], a['name']), 'discordId': a['discordId']} for a in m['authors']],
            'workshopUrl': w['url'],
            'addonGuid': w['guid'],
            'scenarioId': w['scenarioId'],
            'tags': m['tags'],
            # relative to data/catalogue (files/<id>.layer)
            'markersLayer': m['markersLayer']['file'] if m.get('markersLayer') else None,
            'briefing': {**({'sides': sides} if sides else {}), 'sections': m['briefing']},
        }
        if m.get('planning') is False:
            rec['planning'] = False
        if m.get('slotting') is True:
            rec['squads'] = m['squads']
        elif m.get('slotting') is False:
            rec['noSlotting'] = True
        out.append(rec)
    for rec in json.load(open(EXTRA, encoding='utf-8')):
        rec['authors'] = [{**a, 'name': names.get(a['discordId'], a['name'])} for a in rec['authors']]
        out.append(rec)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
    print(f'{len(out)} missions → {os.path.relpath(OUT, ROOT)}; covers {sum(1 for r in out if r["coverUrl"])}, '
          f'slot templates {sum(1 for r in out if "squads" in r)}, no slotting {sum(1 for r in out if r.get("noSlotting"))}')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
