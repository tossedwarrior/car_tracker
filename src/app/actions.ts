"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin, requireUser } from "@/lib/current-user";
import {
  addCar,
  countFollowers,
  followedIds,
  getWatch,
  parseWatchForm,
  unfollow,
  updateCar,
  type FormErrors,
} from "@/lib/watchlist";

// Every action checks who's signed in: the proxy only checks that a cookie exists.
// Customer.io updates (src/lib/people.ts) run in after(), once the response is
// sent, so a slow Customer.io never slows the app down.

/** Tell Customer.io about a change to someone: an event, then their updated profile. */
function sendToCustomerio(userId: number, event?: string, properties?: Record<string, unknown>) {
  after(async () => {
    const { syncPerson, trackPerson } = await import("@/lib/people");
    if (event) await trackPerson(userId, event, properties);
    await syncPerson(userId);
  });
}

export interface WatchFormState {
  errors: FormErrors;
  /** What was submitted, so the form can show it again next to the errors. */
  values?: Record<string, string>;
}

export async function saveWatch(
  _prev: WatchFormState,
  form: FormData,
): Promise<WatchFormState> {
  const { getCarImages, readImageUpload, saveCarPhotoSettings, saveImage } = await import("@/lib/images");
  const user = await requireUser();
  const id = Number(form.get("id")) || null;
  if (id && !(await getWatch(user.id, id))) notFound();
  // Images are optional; editing keeps the old ones unless replaced.
  const logo = await readImageUpload(form.get("logo"), "logo", { required: false });
  const photo = await readImageUpload(form.get("photo"), "photo", { required: false });
  const values = () =>
    Object.fromEntries([...form].flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])));

  const parsed = parseWatchForm(form);
  const errors = {
    ...(parsed.ok ? {} : parsed.errors),
    ...("error" in logo ? { logo: logo.error } : {}),
    ...("error" in photo ? { photo: photo.error } : {}),
  };
  if (!parsed.ok || "error" in logo || "error" in photo) return { errors, values: values() };

  let watchId: number;
  if (id) {
    watchId = await updateCar(user, id, parsed.values);
    sendToCustomerio(user.id);
  } else {
    const added = await addCar(user, parsed.values);
    if ("error" in added) return { errors: { form: added.error }, values: values() };
    watchId = added.watchId;
    const { watchTitle, formatYears } = await import("@/lib/format");
    const v = parsed.values;
    sendToCustomerio(user.id, "car_followed", {
      car_id: watchId,
      car: watchTitle(v),
      years: formatYears(v.yearMin, v.yearMax),
      target_price: v.targetPrice,
      target_currency: v.targetPrice ? v.targetCurrency : null,
    });
  }

  // A car's images are shared by everyone who follows it. Only the owner, or
  // someone who's its only follower, can replace them; anyone can add a
  // missing one.
  const current = await getCarImages(watchId);
  const mayReplace = user.isAdmin || (await countFollowers(watchId)) === 1;
  if (logo.image && (mayReplace || !current.logo)) await saveImage(watchId, "logo", logo.image);
  if (photo.image && (mayReplace || !current.photo)) await saveImage(watchId, "photo", photo.image);
  if (mayReplace || (photo.image && !current.photo)) {
    const { parseWheels } = await import("@/lib/wheels");
    await saveCarPhotoSettings(watchId, {
      wheels: parseWheels(String(form.get("wheels") ?? "")),
      facesRight: form.get("facesRight") === "on",
    });
  }

  // No photo yet: look for one online once the page has responded (it can
  // take a few seconds). Does nothing without CARSXE_API_KEY, or if this car
  // has already been looked up.
  if (!photo.image) {
    const id = watchId;
    after(async () => {
      const { lookUpCarPhoto } = await import("@/lib/car-photo");
      try {
        const result = await lookUpCarPhoto(id);
        if (result.status === "saved" || result.status === "none_usable") {
          console.log(`[car photo] car #${id}: ${result.status}`, "reasons" in result ? result.reasons : result.source);
        }
      } catch (e) {
        console.error(`[car photo] car #${id}: lookup failed:`, (e as Error).message);
      }
    });
  }

  revalidatePath("/");
  redirect(`/watch/${watchId}`);
}

export async function removeWatch(form: FormData) {
  const user = await requireUser();
  const id = Number(form.get("id"));
  const watch = id ? await getWatch(user.id, id) : undefined;
  if (watch) {
    await unfollow(user.id, id);
    const { watchTitle } = await import("@/lib/format");
    sendToCustomerio(user.id, "car_unfollowed", { car_id: id, car: watchTitle(watch) });
  }
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
  const user = await requireUser();
  // One car, or all of this person's cars; never anyone else's.
  const watchId = Number(form.get("watchId")) || null;
  const mine = await followedIds(user.id);
  const watchIds = watchId ? mine.filter((id) => id === watchId) : mine;
  if (watchIds.length === 0) return { status: "ok", log: ["No cars to refresh."], calls: 0 };
  const result = await runRefresh({ watchIds });
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
  // Old Cars Data allows 10 queries a month for the whole site: the owner's call.
  await requireAdmin();
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
  const currency = parseDisplayCurrency(String(form.get("currency")));
  (await cookies()).set(DISPLAY_COOKIE, currency, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
    sameSite: "lax",
  });
  // Saved on the account too, so emails show prices the same way.
  const { getCurrentUser } = await import("@/lib/current-user");
  const user = await getCurrentUser();
  if (user && user.displayCurrency !== currency) {
    const { setDisplayCurrency: save } = await import("@/lib/users");
    await save(user.id, currency);
    sendToCustomerio(user.id);
  }
  revalidatePath("/", "layout");
}

export async function markAlertsSeen() {
  const { markAllAlertsSeen } = await import("@/jobs/alerts");
  await markAllAlertsSeen((await requireUser()).id);
  revalidatePath("/", "layout");
}

export async function fixListing(form: FormData) {
  const { correctListing } = await import("@/jobs/corrections");
  const { Rates } = await import("@/lib/fx");
  // Corrections change a listing for everyone who follows the car.
  await requireAdmin();
  const id = Number(form.get("id"));
  const currency = String(form.get("currency") ?? "");
  const location = String(form.get("location") ?? "").trim();
  const listing = await correctListing(
    id,
    {
      currency: currency === "CAD" || currency === "USD" ? currency : null,
      location: location || null,
    },
    await Rates.load(),
  );
  revalidatePath("/", "layout");
  redirect(`/watch/${listing.watchId}`);
}

export async function setHomeView(form: FormData) {
  const { cookies } = await import("next/headers");
  (await cookies()).set("home_view", form.get("view") === "list" ? "list" : "expanded", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
    sameSite: "lax",
  });
  revalidatePath("/");
  // Start the new view from the top.
  redirect("/");
}

export interface PreferencesState {
  saved?: boolean;
}

export async function savePreferences(_prev: PreferencesState, form: FormData): Promise<PreferencesState> {
  const { updatePreferences } = await import("@/lib/users");
  const user = await requireUser();
  await updatePreferences(user.id, {
    name: String(form.get("name") ?? "").trim().slice(0, 100) || null,
    listingEmails: form.get("listingEmails") === "on",
    monthlyReport: form.get("monthlyReport") === "on",
  });
  sendToCustomerio(user.id);
  revalidatePath("/settings");
  return { saved: true };
}

export async function deleteAccount() {
  const { cookies } = await import("next/headers");
  const { deleteUser } = await import("@/lib/users");
  const { recordAccountDeleted } = await import("@/lib/people");
  const { SESSION_COOKIE } = await import("@/lib/auth");
  const user = await requireUser();
  await deleteUser(user.id);
  // Customer.io keeps the (emptied) profile, so the churn email can reach them.
  after(() => recordAccountDeleted(user));
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
