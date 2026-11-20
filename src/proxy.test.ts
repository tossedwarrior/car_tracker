import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail, safeNext, SESSION_COOKIE } from "@/lib/auth";
import { proxy } from "./proxy";

const site = "https://cars.example.com";

const request = (path: string, { cookie, method = "GET" }: { cookie?: string; method?: string } = {}) =>
  new NextRequest(`${site}${path}`, { method, headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });

const rewrittenTo = (res: Response) => res.headers.get("x-middleware-rewrite");

describe("proxy", () => {
  it("shows signed-out visitors the sign-in page at the same address, with status 200", async () => {
    const res = await proxy(request("/watch/1?sort=km"));
    expect(res.status).toBe(200); // host health checks pass
    expect(rewrittenTo(res)).toBe(`${site}/login?next=%2Fwatch%2F1%3Fsort%3Dkm`);
  });

  it("refuses posts without a session, but sends the sign-in form's action to the sign-in page", async () => {
    expect((await proxy(request("/watch/1", { method: "POST" }))).status).toBe(401);
    const action = new NextRequest(`${site}/watch/1`, { method: "POST", headers: { "next-action": "abc" } });
    expect(rewrittenTo(await proxy(action))).toBe(`${site}/login?next=%2Fwatch%2F1`);
  });

  it("lets a browser with a session cookie through (pages check it's valid)", async () => {
    expect(rewrittenTo(await proxy(request("/", { cookie: "some-token" })))).toBeNull();
  });

  it("always allows the sign-in pages and their forms, and reading About", async () => {
    for (const path of ["/login", "/login/verify"]) {
      expect(rewrittenTo(await proxy(request(path)))).toBeNull();
      expect((await proxy(request(path, { method: "POST" }))).status).toBe(200);
    }
    expect(rewrittenTo(await proxy(request("/about")))).toBeNull();
    expect((await proxy(request("/about", { method: "POST" }))).status).toBe(401);
  });
});

describe("sign-in helpers", () => {
  it("never redirects to another site", () => {
    expect(safeNext("/alerts")).toBe("/alerts");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });

  it("treats addresses the same whatever their case and spacing", () => {
    expect(normalizeEmail("  Me@Example.COM ")).toBe("me@example.com");
    expect(isValidEmail("me@example.com")).toBe(true);
    expect(isValidEmail("me@example")).toBe(false);
    expect(isValidEmail("me @example.com")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});
