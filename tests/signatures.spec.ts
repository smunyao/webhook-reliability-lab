import { describe, expect, test } from "vitest";

import { signPayload, verifySignature } from "../src/signatures.js";

describe("webhook signatures", () => {
  test("accepts an unchanged payload signed with the shared secret", () => {
    const payload = JSON.stringify({ id: "evt_001" });
    const signature = signPayload(payload, "secret");

    expect(verifySignature(payload, signature, "secret")).toBe(true);
  });

  test("rejects a payload changed after it was signed", () => {
    const signature = signPayload('{"id":"evt_001"}', "secret");

    expect(
      verifySignature('{"id":"evt_002"}', signature, "secret"),
    ).toBe(false);
  });

  test("rejects missing and malformed signatures", () => {
    expect(verifySignature("{}", undefined, "secret")).toBe(false);
    expect(verifySignature("{}", "not-a-signature", "secret")).toBe(false);
  });
});
