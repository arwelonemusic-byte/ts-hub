import Link from "next/link";
import { FNF_HOME } from "@/lib/fix-and-flank/game";
import { getT } from "@/lib/i18n-server";

export default async function MapNotFound() {
  const { t } = await getT();
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <p className="type-heading-s text-fg">{t("fnf.map.notFound")}</p>
      <Link href={FNF_HOME} className="type-label-m text-fg-accent">
        ← {t("fnf.back")}
      </Link>
    </main>
  );
}
