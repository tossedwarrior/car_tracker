import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as login } from "@/app/api/login/route";
import { safeNext, SESSION_COOKIE, sessionToken } from "@/lib/auth";
import { proxy } from "./proxy";

const PASSWORD = "s3cret with spaces";
const site = "https://cars.example.com";

const get = (path: string, cookie?: string) =>
  new NextRequest(`${site}${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });

const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("lets everything through when no APP_PASSWORD is set", async () => {
    vi.stubEnv("APP_PASSWORD", "");
    const res = await proxy(get("/settings"));
    expect(res.status).toBe(200);
    expect(rewrittenTo(res)).toBeNull();
  });

  it("shows signed-out visitors the sign-in page at the same address, with status 200", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    const res = await proxy(get("/watch/1?sort=km"));
    expect(res.status).toBe(200); // host health checks pass
    expect(rewrittenTo(res)).toBe(`${site}/login?next=%2Fwatch%2F1%3Fsort%3Dkm`);
  });

  it("refuses posts (Refresh, forms) without a session", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    const res = await proxy(new NextRequest(`${site}/watch/1`, { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("lets a signed-in browser through, but not one with an old or made-up cookie", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    expect(rewrittenTo(await proxy(get("/", await sessionToken(PASSWORD))))).toBeNull();
    expect(rewrittenTo(await proxy(get("/", await sessionToken("old password"))))).not.toBeNull();
    expect(rewrittenTo(await proxy(get("/", "made-up")))).not.toBeNull();
  });

  it("always allows the sign-in page and form", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    expect(rewrittenTo(await proxy(get("/login")))).toBeNull();
    const post = await proxy(new NextRequest(`${site}/api/login`, { method: "POST" }));
    expect(post.status).toBe(200);
  });
});

describe("sign-in form", () => {
  const submit = (password: string, next = "/watch/1") => {
    const body = new FormData();
    body.set("password", password);
    body.set("next", next);
    return login(new NextRequest(`${site}/api/login`, { method: "POST", body }));
  };

  it("sets a 30-day cookie and goes back to the page on the right password", async () => {
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    const res = await submit(PASSWORD);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/watch/1");
    const cookie = res.cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBe(await sessionToken(PASSWORD));
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 24 * 3600 });
  });

  it("goes back to the form with an error on a wrong password", async () => {
    vi.useFakeTimers();
    vi.stubEnv("APP_PASSWORD", PASSWORD);
    const pending = submit("nope");
    await vi.advanceTimersByTimeAsync(1000);
    const res = await pending;
    vi.useRealTimers();
    expect(res.headers.get("location")).toBe("/login?error=1&next=%2Fwatch%2F1");
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("never redirects to another site", () => {
    expect(safeNext("/alerts")).toBe("/alerts");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
