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

export interface CheckNowState {
  log?: string[];
  status?: string;
}

export async function runCheckNow(_prev: CheckNowState): Promise<CheckNowState> {
  const { runDailyCheck } = await import("@/jobs/daily");
  const result = await runDailyCheck();
  revalidatePath("/", "layout");
  return { log: result.log, status: result.status };
}
