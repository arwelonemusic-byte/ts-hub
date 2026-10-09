# Shared Discord login: Hub + Training Portal (2026-10-09)

Goal: log in once with Discord and be logged in on both `hub.tacticalshift.ru` and `training.tacticalshift.ru`;
log out on either and be logged out of both.

**Done 2026-10-09** as planned below. Decisions: the parent-domain cookie is fine (it also reaches the apex);
everyone logs in once more; the Discord app is renamed "Tactical Shift". The "Today" table is the state before.

## Today

| | Training Portal | TS Hub |
|---|---|---|
| Discord app | "TS Training" | the same app (same client ID/secret) |
| Session cookie | `ts_session`, host-only | `ts_hub_session`, host-only |
| Token | HS256 JWT, 7 days, its own `SESSION_SECRET` | same format, its own `SESSION_SECRET` |
| Payload | `{ userId, username, displayName, avatar, roles }` | the same |
| Roles | names via `DISCORD_ROLE_MAP`, refreshed with the bot token on every `/api/auth/session` call | names via its map (the portal's + Aircraft Vehicle, Armoured Crew, mission officer), at login only |
| OAuth `state` (CSRF) check | none | yes |

## Plan

1. **Discord app (Galaxy, Developer Portal → the app → General Information).** Rename "TS Training" to
   "Tactical Shift": the consent screen then reads «Tactical Shift wants to access your Discord account». The app has
   a bot user (the portal's role refresh uses its token); its username is set separately on the Bot tab, if that
   should change too. Both callback URLs are already in the redirect list.
2. **One cookie for both.** A new cookie `ts_auth`: `Domain=tacticalshift.ru`, `Secure`, `HttpOnly`,
   `SameSite=Lax`, 7 days, signed with a new shared secret `TS_AUTH_SECRET` that goes into both `/etc/ts-hub.env` and
   `/etc/ts-training-portal.env`. Same payload as today. The same small session module in both repos.
   In dev (localhost) the cookie stays host-only, so each app keeps its own login there.
3. **Each app keeps its own login and callback** (each sends you back to itself), and both write `ts_auth`. The
   portal gets the hub's OAuth `state` check. Logout on either clears `ts_auth` (with the same `Domain`, or the
   browser won't drop it) and so logs out of both.
4. **Same role names in both.** One `DISCORD_ROLE_MAP` in both env files (the hub's 12 roles), since whichever app
   signed the token decides the names in it.
5. **Fresh roles in the hub too.** The hub refreshes roles with the bot token like the portal does (every ~10
   minutes, re-signing `ts_auth`), so a new Discord role counts without logging out. Needs `DISCORD_BOT_TOKEN` in
   `/etc/ts-hub.env`.
6. **Switch-over.** Deploy both apps the same evening. Old `ts_session` / `ts_hub_session` cookies are ignored, so
   everyone logs in once more. Rollback = redeploy the previous versions (the old cookies were never removed).
7. **Test:** log in on the hub → open the portal (logged in, same roles) → log out on the portal → hub logged out;
   a member without a role and a non-member are refused as today.

## To decide

- **The cookie also reaches `tacticalshift.ru` itself.** `Domain=tacticalshift.ru` sends it to the apex and every
  subdomain. The subdomains (planner, builder) are ours, but the apex is the domain owner's GitHub Pages site, so the
  token leaves our box on visits there. GitHub doesn't show request cookies to site owners, so the practical risk
  is low; it would matter if the apex ever moved to a host that logs requests. The alternative is the hub as the
  login server: the portal sends you to the hub to log in and gets a one-minute ticket back, each site keeping its
  own host-only cookie. That way nothing goes to the apex, but it's more work, and logging out stays per site.
- **Everyone logs into the portal once more** after the switch (step 6).
