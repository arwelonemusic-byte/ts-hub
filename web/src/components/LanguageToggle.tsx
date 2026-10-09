import { setLocale } from "@/lib/actions";
import type { Locale } from "@/lib/i18n";

export function LanguageToggle({ locale }: { locale: Locale }) {
  return (
    <div className="flex rounded-md bg-inset p-0.5" role="group" aria-label="Language">
      {(["en", "ru"] as const).map((l) => (
        <form key={l} action={setLocale.bind(null, l)}>
          <button
            type="submit"
            aria-pressed={locale === l}
            className={`h-7 rounded-sm px-2.5 type-caption-strong ${
              locale === l ? "bg-raised text-fg" : "text-fg-tertiary hover:text-fg-secondary"
            }`}
          >
            {l === "en" ? "ENG" : "RU"}
          </button>
        </form>
      ))}
    </div>
  );
}
