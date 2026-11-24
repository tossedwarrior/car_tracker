import { cookies } from "next/headers";
import type { Currency } from "@/db/schema";
import { getCurrentUser } from "./current-user";
import { DISPLAY_COOKIE, parseDisplayCurrency } from "./money";

/**
 * The currency prices are shown in, chosen in Settings: this browser's
 * choice, else the account's (a new browser), else CAD.
 */
export async function getDisplayCurrency(): Promise<Currency> {
  const chosen = (await cookies()).get(DISPLAY_COOKIE)?.value;
  if (chosen) return parseDisplayCurrency(chosen);
  return (await getCurrentUser())?.displayCurrency ?? "CAD";
}
