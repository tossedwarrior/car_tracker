import { afterEach, describe, expect, it, vi } from "vitest";
import { makeUser } from "@/test/db";
import { fakeCustomerio } from "@/test/customerio";
import { customerioRegion, sendTransactionalEmail, setCustomerioForTests } from "./customerio";
import { sendSignInLink } from "./email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ok = () => new Response(JSON.stringify({ delivery_id: "d1" }), { status: 200 });

describe("customerioRegion", () => {
  it("uses CUSTOMERIO_REGION, else an EU key's prefix, else US", () => {
    expect(customerioRegion({})).toBe("us");
    expect(customerioRegion({ CUSTOMERIO_APP_API_KEY: "sk_eu_123" })).toBe("eu");
    expect(customerioRegion({ CUSTOMERIO_REGION: "US", CUSTOMERIO_APP_API_KEY: "sk_eu_123" })).toBe("us");
  });
});

describe("sendTransactionalEmail", () => {
  const email = { message: "sign_in_link", to: "a@example.com", userId: 7, data: { signin_url: "https://x/y" } };

  it("does nothing without an App API key", async () => {
    const fetch = vi.fn();
    expect(await sendTransactionalEmail(email, fetch)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts to the App API in the key's region, untracked and not kept by default", async () => {
    vi.stubEnv("CUSTOMERIO_APP_API_KEY", "sk_eu_secret");
    vi.stubEnv("CUSTOMERIO_FROM", "Poster Wall <hi@example.com>");
    const fetch = vi.fn(async () => ok());
    expect(await sendTransactionalEmail({ ...email, message: "12" }, fetch)).toBe(true);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api-eu.customer.io/v1/send/email");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_eu_secret");
    expect(JSON.parse(String(init.body))).toEqual({
      transactional_message_id: 12,
      to: "a@example.com",
      identifiers: { id: "7" },
      message_data: { signin_url: "https://x/y" },
      tracked: false,
      disable_message_retention: true,
      from: "Poster Wall <hi@example.com>",
    });
  });

  it("reports a refusal or a network error as not sent", async () => {
    vi.stubEnv("CUSTOMERIO_APP_API_KEY", "sk_us_secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendTransactionalEmail(email, async () => new Response("bad", { status: 400 }))).toBe(false);
    expect(await sendTransactionalEmail(email, async () => Promise.reject(new Error("offline")))).toBe(false);
  });
});

describe("sendSignInLink", () => {
  it("adds the person to Customer.io, then emails the link through the sign-in message", async () => {
    vi.stubEnv("CUSTOMERIO_APP_API_KEY", "sk_us_secret");
    vi.stubEnv("CUSTOMERIO_SIGNIN_MESSAGE", "magic_link");
    const cio = fakeCustomerio();
    setCustomerioForTests(cio);
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    const user = await makeUser({ email: "driver@example.com" });

    expect(await sendSignInLink({ userId: user.id, email: user.email, url: "https://site/login/verify?token=t" })).toEqual({
      delivered: true,
    });
    expect(cio.sent[0]).toMatchObject({ kind: "identify", userId: user.id, traits: { email: "driver@example.com" } });
    const body = JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({
      transactional_message_id: "magic_link",
      to: "driver@example.com",
      message_data: { signin_url: "https://site/login/verify?token=t", expires_minutes: 30 },
    });
  });

  it("falls back to showing the link when nothing could be sent", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendSignInLink({ userId: 1, email: "a@example.com", url: "https://x" })).toEqual({
      delivered: false,
      problem: "not_set_up",
    });
    vi.stubEnv("CUSTOMERIO_APP_API_KEY", "sk_us_secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", async () => new Response("not found", { status: 400 }));
    expect(await sendSignInLink({ userId: 1, email: "a@example.com", url: "https://x" })).toEqual({
      delivered: false,
      problem: "failed",
    });
  });
});
