import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordFromHeader, proxy } from "./proxy";

const basic = (user: string, password: string) => `Basic ${btoa(`${user}:${password}`)}`;
const request = (authorization?: string) =>
  new NextRequest("https://cars.example.com/", { headers: authorization ? { authorization } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("proxy", () => {
  it("lets everything through when no APP_PASSWORD is set", () => {
    vi.stubEnv("APP_PASSWORD", "");
    expect(proxy(request()).status).toBe(200);
  });

  it("asks for the password, and accepts it with any username", () => {
    vi.stubEnv("APP_PASSWORD", "s3cret:with colon");
    const denied = proxy(request());
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("Basic");
    expect(proxy(request(basic("me", "wrong"))).status).toBe(401);
    expect(proxy(request(basic("anything", "s3cret:with colon"))).status).toBe(200);
  });

  it("ignores headers that aren't Basic auth", () => {
    expect(passwordFromHeader("Bearer abc")).toBeNull();
    expect(passwordFromHeader("Basic %%%")).toBeNull();
    expect(passwordFromHeader(null)).toBeNull();
  });
});
