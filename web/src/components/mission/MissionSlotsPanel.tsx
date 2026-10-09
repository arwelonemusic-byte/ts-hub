import { plural, type Locale, type T } from "@/lib/i18n";
import type { MissionSquad } from "@/lib/types";
import { Tag } from "../ui";

/** The mission's slot template, laid out like the event page's slots panel but without players. */
export function MissionSlotsPanel({ squads, noSlotting, locale, t }: { squads?: MissionSquad[]; noSlotting?: boolean; locale: Locale; t: T }) {
  const total = squads?.reduce((n, sq) => n + sq.slots.length, 0) ?? 0;
  return (
    <section className="flex flex-col gap-6 rounded-xl bg-inset p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="type-heading-xs text-fg">{t("slots.title")}</h2>
        {total > 0 && <span className="type-caption text-fg-secondary">{plural(locale, "missionPage.slots.count", total)}</span>}
      </div>
      {squads?.length ? (
        squads.map((sq) => (
          <div key={sq.groupId} className="flex flex-col">
            <div className="flex items-baseline justify-between pb-1.5 text-fg-tertiary">
              <span className="type-eyebrow">
                {sq.groupId} {sq.name}
              </span>
              <span className="type-caption">{sq.slots.length}</span>
            </div>
            {sq.slots.map((s, i) => (
              <div key={i} className="flex h-10 items-center gap-2.5 border-t border-line">
                <span className="min-w-0 flex-1 truncate type-body-s text-fg">{s.role}</span>
                {s.requiredRole && (
                  <span title={t("missionPage.slots.role", { role: s.requiredRole })}>
                    <Tag outline>@{s.requiredRole}</Tag>
                  </span>
                )}
              </div>
            ))}
          </div>
        ))
      ) : (
        <p className="type-body-s text-fg-secondary">{t(noSlotting ? "missionPage.slots.none" : "missionPage.slots.unset")}</p>
      )}
    </section>
  );
}
