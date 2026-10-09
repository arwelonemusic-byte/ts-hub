const PLANNER = process.env.NEXT_PUBLIC_PLANNER_URL ?? "https://planner.tacticalshift.ru";

export const TRAINING_URL = "https://training.tacticalshift.ru";
export const BUILDER_URL = "https://builder.tacticalshift.ru";
export const PLANNER_URL = PLANNER;

/**
 * A replay in the planner (`?replay=CODE`). Given its game, the viewer's Plan overlay also gets the
 * mission's Markers.layer and the game's plan (used when the replay carries no /syncplan stamp).
 */
export const replayUrl = (code: string, game?: { mission: { id: string }; planCode: string | null }) => {
  const q = new URLSearchParams({ replay: code });
  if (game) {
    q.set("mission", game.mission.id);
    if (game.planCode) q.set("plan", game.planCode);
  }
  return `${PLANNER}/?${q.toString()}`;
};

/**
 * The mission's Workshop page. Until the catalogue knows every mission's Workshop id, missions
 * without one link to a Workshop search for their name, which finds the mod.
 */
export const workshopUrl = (mission: { name: string; workshopUrl?: string }) =>
  mission.workshopUrl ?? `https://reforger.armaplatform.com/workshop?search=${encodeURIComponent(mission.name)}`;

/** Opening a plan goes through the hub (app/plan/open), which decides whether it opens editable. */
export const planOpenHref = (plan: { id?: string; code: string }, missionId: string) =>
  plan.id
    ? `/plan/open?plan=${encodeURIComponent(plan.id)}`
    : `/plan/open?mission=${encodeURIComponent(missionId)}&code=${encodeURIComponent(plan.code)}`;
