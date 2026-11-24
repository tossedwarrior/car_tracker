import type { CustomerioClient, Traits } from "@/lib/customerio";

export type Sent =
  | { kind: "identify"; userId: number; traits: Traits }
  | { kind: "track"; userId: number; event: string; properties?: Traits; messageId?: string };

/** A Customer.io client that keeps what it's sent, for tests to check. */
export function fakeCustomerio(): CustomerioClient & { sent: Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    identify: async (userId, traits) => void sent.push({ kind: "identify", userId, traits }),
    track: async (userId, event, properties, messageId) =>
      void sent.push({ kind: "track", userId, event, properties, messageId }),
    flush: async () => {},
  };
}
