"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, type Locale } from "./i18n";

/** Setting a cookie in a Server Action re-renders the current route, so no client refresh is needed. */
export async function setLocale(locale: Locale) {
  (await cookies()).set(LOCALE_COOKIE, locale === "ru" ? "ru" : "en", {
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
    sameSite: "lax",
  });
}
