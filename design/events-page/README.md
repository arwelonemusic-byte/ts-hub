# Events page concept

Claude Design canvas: https://claude.ai/artifact/71RyAtadBWGDVUGM5XBf9a (private until shared).

- `Main.dc.html` — Upcoming: week-by-week agenda built around the Tue 20:00 / Sun 19:00 slots, next op featured,
  extra ops (Thu) slotted in, empty usual slots shown as open, month mini-calendar.
- `Past.dc.html` — Past: month sections, each op with players, duration, deaths, top AI kills, replay link(s),
  plan used, achievement pills.
- `EventUpcoming.dc.html` — Event details, upcoming (Fallen Hawk): poster hero with slots/plan status, author's
  briefing (situation / objectives / enemy / support), plan panel with mission markers + PL "attach plan code",
  progressive-slotting roster (locked slots follow the slotting bot's rules).
- `EventPast.dc.html` — Event details, past (Counterpunch): attended vs slotted, op totals, awards, leaderboards,
  friendly-fire log, plan used drawn over the map, who was there / no-shows, collapsed briefing.
- `canvas.json` — artboard layout on the canvas.

Data is a mix: past ops, covers, maps and authors are real; upcoming dates, slot counts, PL names and plan codes are mock.

## Asset map (`/_blob/<id>` → file)

| blob id | file |
|---|---|
| 62f76b5ef0ace0bb42030e192aad8910 | assets/shortening.jpg |
| 249c5569075d3293679cb98673cfb768 | assets/fallenhawk.jpg |
| 5e6cf458a0e19f23818259f3cda60be1 | assets/geras.jpg |
| 7f37124ec17c2187b8ecf1ca66148927 | assets/bastion.jpg |
| 42be5984af1594a5408e12424ba4f159 | assets/anothercastle.jpg |
| e8819e819dca3fbbf70080072960e4f1 | assets/counterpunch.jpg |
| 579265f3462aabce2ed95ff4e4e4b6de | assets/emerald.jpg |
| b30ae6222c9f2d43ea273430cf374329 | assets/quietwitness.jpg |
| 0fe74486b7849423e82542bd73174279 | assets/reverseslope.jpg |
| 2867290b44630916dac1a707e09341b4 | assets/regina.jpg |
| 455dd3f519988d6962778ae072974e83 | assets/merak-sat.jpg (fallback art when a mission has no cover) |
| 40e4a1b0370ecac49db9761d7439d923 | assets/ts-logo.svg |
| 495849428231a73d1c850b83317194ac | assets/mogadishu-plan.jpg |
| 73cee027cccd93da4c9cd1d6c8e5c3f9 | assets/ruha-plan.jpg |
