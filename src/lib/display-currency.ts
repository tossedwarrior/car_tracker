import { cookies } from "next/headers";
import type { Currency } from "@/db/schema";
import { DISPLAY_COOKIE, parseDisplayCurrency } from "./money";

/** The currency prices are shown in, chosen in the header. CAD by default. */
export async function getDisplayCurrency(): Promise<Currency> {
  return parseDisplayCurrency((await cookies()).get(DISPLAY_COOKIE)?.value);
}
