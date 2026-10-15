import { redirect } from "next/navigation";
import { FNF_HOME } from "@/lib/fix-and-flank/game";

/** «Мини-игры» has one game so far: /games is its page. */
export default function GamesPage() {
  redirect(FNF_HOME);
}
