import Link from "next/link";
import { getT } from "@/lib/i18n-server";

export default async function NotFound() {
  const { t } = await getT();
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <p className="type-heading-s text-fg">{t("event.notFound")}</p>
      <Link href="/events" className="type-label-m text-fg-accent">
        ← {t("event.back")}
      </Link>
    </main>
  );
}
