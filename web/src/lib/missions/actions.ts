"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getHubData } from "../data";
import { getDb } from "../db";
import { mapLabel, MAPS } from "../maps";
import { playerIdOf } from "../players";
import { removeUpload } from "../uploads";
import { getViewer } from "../viewer";
import { canAddMission, canEditMission } from ".";
import { checkDraft, normalizeDraft, slugify, type DraftError, type MissionDraft, type WorkshopInfo } from "./draft";
import { fetchWorkshopAsset, storeWorkshopCover, workshopGuid, workshopPage } from "./workshop";

export type LookupResult = { info: WorkshopInfo } | { error: "forbidden" | "badLink" | "notFound" | "unreachable" | "noScenario" };

/** Step 1 of the dialog: what the Workshop says about an addon. `editing` = the mission being edited. */
export async function lookupWorkshop(input: string, editing?: string): Promise<LookupResult> {
  if (!canAddMission(await getViewer())) return { error: "forbidden" };
  const guid = workshopGuid(input);
  if (!guid) return { error: "badLink" };
  const asset = await fetchWorkshopAsset(guid);
  if (typeof asset === "string") return { error: asset };
  if (!asset.scenarios.length) return { error: "noScenario" };
  const taken = (await (await getDb()).query(
    "SELECT id, name, scenario_id FROM missions WHERE addon_guid = $1 AND id <> $2 AND scenario_id IS NOT NULL",
    [asset.guid, editing ?? ""],
  )) as { id: string; name: string; scenario_id: string }[];
  return {
    info: {
      guid: asset.guid,
      url: workshopPage(asset.guid),
      title: asset.title,
      coverUrl: asset.coverUrl,
      scenarios: asset.scenarios,
      terrain: asset.terrain,
      taken: taken.map((t) => ({ scenarioId: t.scenario_id, missionId: t.id, name: t.name })),
    },
  };
}

export type SaveResult = { id: string } | { error: DraftError | "forbidden" | "notFound" | "taken" | "selfAuthor" | "unreachable" };

/** «Сохранить»: a new mission, or the edited one; its id, for the dialog to open its page. */
export async function saveMission(input: MissionDraft): Promise<SaveResult> {
  const viewer = await getViewer();
  const data = getHubData();
  const existing = input.id ? await data.getMission(input.id) : null;
  if (input.id ? !existing || !canEditMission(viewer, existing) : !canAddMission(viewer)) return { error: input.id && !existing ? "notFound" : "forbidden" };
  const d = normalizeDraft(input);
  const err = checkDraft(d, MAPS.map((m) => m.key), !!existing?.hasMarkersLayer);
  if (err) return { error: err };
  const db = await getDb();

  // Authors: members keep their Discord id only if the hub knows them. A mission maker stays an
  // author of what they add or edit — otherwise they'd lose the right to edit it.
  const known = new Set(
    ((await db.query("SELECT discord_id FROM players WHERE discord_id = ANY($1::text[])", [d.authors.flatMap((a) => (a.discordId ? [a.discordId] : []))])) as {
      discord_id: string;
    }[]).map((r) => r.discord_id),
  );
  const authors = d.authors.map((a) => (a.discordId && known.has(a.discordId) ? a : { name: a.name }));
  if (!viewer!.isAdmin && !authors.some((a) => a.discordId === viewer!.discordId)) {
    if (existing) return { error: "selfAuthor" };
    authors.unshift({ name: viewer!.name, discordId: viewer!.discordId });
  }

  const [clash] = await db.query("SELECT id FROM missions WHERE scenario_id = $1 AND id <> $2", [d.scenarioId, existing?.id ?? ""]);
  if (clash) return { error: "taken" };

  let id = existing?.id;
  if (!id) {
    const base = slugify(d.name) || d.workshopGuid.toLowerCase();
    const ids = new Set(((await db.query("SELECT id FROM missions WHERE id = $1 OR id LIKE $2", [base, `${base}-%`])) as { id: string }[]).map((r) => r.id));
    id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  }

  // The cover is the addon's Workshop image: fetched for a new mission, and again when asked or the addon changed.
  let cover = existing?.coverUrl ?? null;
  const newCover = !existing || d.refreshCover || existing.addonGuid !== d.workshopGuid;
  if (newCover) {
    const asset = await fetchWorkshopAsset(d.workshopGuid);
    if (asset === "unreachable") return { error: "unreachable" };
    if (asset === "notFound") return { error: "workshop" };
    cover = (await storeWorkshopCover(id, asset.coverUrl)) ?? cover;
  }

  const player = await playerIdOf(viewer!);
  const briefing = {
    ...(d.briefing.sides.for || d.briefing.sides.against
      ? { sides: { ...(d.briefing.sides.for ? { for: d.briefing.sides.for } : {}), ...(d.briefing.sides.against ? { against: d.briefing.sides.against } : {}) } }
      : {}),
    sections: d.briefing.sections,
  };
  const row = [
    id, d.name, d.mapKey, mapLabel(d.mapKey), cover, workshopPage(d.workshopGuid), d.workshopGuid, d.scenarioId,
    // An object, not a JSON string: the driver encodes jsonb itself (a string would be stored double-encoded).
    briefing, d.tags, d.planning, d.noSlotting, player,
  ];
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.query(
        `UPDATE missions SET name = $2, map_key = $3, map_label = $4, cover_url = $5, workshop_url = $6, addon_guid = $7,
           scenario_id = $8, briefing = $9::jsonb, tags = $10::text[], planning = $11, no_slotting = $12, updated_by = $13,
           updated_at = NOW(), hub_edited_at = NOW()
         WHERE id = $1`,
        row,
      );
    } else {
      await tx.query(
        `INSERT INTO missions (id, name, map_key, map_label, cover_url, workshop_url, addon_guid, scenario_id, briefing, tags,
                               planning, no_slotting, created_by, updated_by, hub_edited_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::text[], $11, $12, $13, $13, NOW())`,
        row,
      );
    }
    if (d.markersLayer !== undefined) await tx.query("UPDATE missions SET markers_layer = $2 WHERE id = $1", [id, d.markersLayer]);
    await tx.query("DELETE FROM mission_authors WHERE mission_id = $1", [id]);
    for (const [i, a] of authors.entries()) {
      await tx.query("INSERT INTO mission_authors (mission_id, position, discord_id, name) VALUES ($1, $2, $3, $4)", [id, i, a.discordId ?? null, a.name]);
    }
    // The template only: games already scheduled keep the slots they copied.
    await tx.query("DELETE FROM mission_slots WHERE mission_id = $1", [id]);
    let pos = 0;
    for (const sq of d.squads) {
      for (const s of sq.slots) {
        await tx.query(
          "INSERT INTO mission_slots (mission_id, position, group_id, group_name, role, required_role) VALUES ($1, $2, $3, $4, $5, $6)",
          [id, pos++, sq.groupId, sq.name, s.role, s.requiredRole ?? null],
        );
      }
    }
  });
  if (newCover && existing?.coverUrl && existing.coverUrl !== cover) await removeUpload(existing.coverUrl);

  revalidatePath("/missions");
  revalidatePath(`/missions/${id}`);
  revalidatePath("/events");
  return { id };
}

/** «В архив» / «Вернуть из архива» (admin): off the catalogue and the schedule dialog, or back. */
export async function setMissionArchived(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const id = String(form.get("mission") ?? "");
  if (!viewer?.isAdmin || !(await getHubData().getMission(id))) return;
  const archive = form.get("archive") === "1";
  await (await getDb()).query(
    `UPDATE missions SET archived_at = ${archive ? "NOW()" : "NULL"}, updated_by = $2, updated_at = NOW(), hub_edited_at = NOW() WHERE id = $1`,
    [id, await playerIdOf(viewer)],
  );
  revalidatePath("/missions");
  revalidatePath(`/missions/${id}`);
  revalidatePath("/events");
}

/** «Удалить» (admin): only a mission that was never scheduled — one with games is archived instead. */
export async function deleteMission(form: FormData): Promise<void> {
  const viewer = await getViewer();
  const mission = await getHubData().getMission(String(form.get("mission") ?? ""));
  if (!viewer?.isAdmin || !mission) return;
  const db = await getDb();
  const [game] = await db.query("SELECT 1 FROM events WHERE mission_id = $1 LIMIT 1", [mission.id]);
  if (game) return;
  await db.transaction(async (tx) => {
    // Plans drawn from its page point at plans in the planner; only the hub's records of them go.
    await tx.query("DELETE FROM plans WHERE mission_id = $1", [mission.id]);
    await tx.query("DELETE FROM missions WHERE id = $1", [mission.id]);
  });
  await removeUpload(mission.coverUrl);
  revalidatePath("/missions");
  revalidatePath("/events");
  redirect("/missions");
}
