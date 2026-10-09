import { cookies } from "next/headers";
import { ENABLED_LOCALES, LOCALE_COOKIE, makeT, type Locale, type T } from "./i18n";

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value as Locale | undefined;
  return v && ENABLED_LOCALES.includes(v) ? v : ENABLED_LOCALES[0];
}

export async function getT(): Promise<{ locale: Locale; t: T }> {
  const locale = await getLocale();
  return { locale, t: makeT(locale) };
}
