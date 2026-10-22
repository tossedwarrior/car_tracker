"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createWatch,
  deleteWatch,
  parseWatchForm,
  updateWatch,
  type FormErrors,
} from "@/lib/watchlist";

export interface WatchFormState {
  errors: FormErrors;
  /** What was submitted, so the form can show it again next to the errors. */
  values?: Record<string, string>;
}

export async function saveWatch(
  _prev: WatchFormState,
  form: FormData,
): Promise<WatchFormState> {
  const parsed = parseWatchForm(form);
  if (!parsed.ok) {
    const values = Object.fromEntries([...form].map(([k, v]) => [k, String(v)]));
    return { errors: parsed.errors, values };
  }

  const id = Number(form.get("id")) || null;
  if (id) updateWatch(id, parsed.values);
  const watchId = id ?? createWatch(parsed.values);

  revalidatePath("/");
  redirect(`/watch/${watchId}`);
}

export async function removeWatch(form: FormData) {
  const id = Number(form.get("id"));
  if (id) deleteWatch(id);
  revalidatePath("/");
  redirect("/");
}

export interface RefreshState {
  status?: "ok" | "partial" | "failed";
  log?: string[];
  calls?: number;
}

export async function refreshListings(_prev: RefreshState, form: FormData): Promise<RefreshState> {
  const { runRefresh } = await import("@/jobs/refresh");
  const watchId = Number(form.get("watchId")) || null;
  const result = await runRefresh({ watchIds: watchId ? [watchId] : undefined });
  revalidatePath("/", "layout");
  return { status: result.status, log: result.log, calls: result.calls };
}

export interface SoldPullState {
  message?: string;
  error?: string;
}

export async function pullSold(_prev: SoldPullState, form: FormData): Promise<SoldPullState> {
  const { pullSoldResults } = await import("@/jobs/sold");
  const { syncRates } = await import("@/lib/fx");
  const watchId = Number(form.get("watchId"));
  // Sales are converted at their sale-date rate; keep rates current.
  await syncRates().catch(() => {});
  try {
    const r = await pullSoldResults(watchId);
    revalidatePath(`/watch/${watchId}`, "layout");
    return {
      message: `${r.found} recent sale${r.found === 1 ? "" : "s"} found, ${r.added} new${
        r.matchedModel ? ` (searched as "${r.matchedModel}")` : ""
      }.`,
    };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setDisplayCurrency(form: FormData) {
  const { cookies } = await import("next/headers");
  const { DISPLAY_COOKIE, parseDisplayCurrency } = await import("@/lib/money");
  (await cookies()).set(DISPLAY_COOKIE, parseDisplayCurrency(String(form.get("currency"))), {
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}

export async function markAlertsSeen() {
  const { markAllAlertsSeen } = await import("@/jobs/alerts");
  markAllAlertsSeen();
  revalidatePath("/", "layout");
}
