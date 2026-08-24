import { describe, expect, test } from "vitest";

import { WebhookReceiver } from "../src/receiver.js";
import { signPayload } from "../src/signatures.js";
import type { WebhookEvent } from "../src/types.js";

const secret = "test-secret";

function createEvent(overrides: Partial<WebhookEvent> = {}): WebhookEvent {
  return {
    id: "evt_001",
    type: "appointment.created",
    aggregateId: "appointment_101",
    sequence: 1,
    occurredAt: "2026-08-25T09:00:00.000Z",
    data: { attendee: "person@example.test" },
    ...overrides,
  };
}

function send(receiver: WebhookReceiver, event: WebhookEvent) {
  const payload = JSON.stringify(event);

  return receiver.handle(payload, signPayload(payload, secret));
}

describe("webhook receiver", () => {
  test("processes a valid event", () => {
    const receiver = new WebhookReceiver({ secret });

    expect(send(receiver, createEvent())).toMatchObject({
      status: 200,
      outcome: "processed",
    });
    expect(receiver.processedEvents).toHaveLength(1);
  });

  test("acknowledges a duplicate without processing it twice", () => {
    const receiver = new WebhookReceiver({ secret });
    const event = createEvent();

    send(receiver, event);

    expect(send(receiver, event)).toMatchObject({
      status: 200,
      outcome: "duplicate",
    });
    expect(receiver.processedEvents).toHaveLength(1);
  });

  test("rejects an event delivered after a newer sequence", () => {
    const receiver = new WebhookReceiver({ secret });

    send(receiver, createEvent({ id: "evt_002", sequence: 2 }));

    expect(send(receiver, createEvent())).toMatchObject({
      status: 409,
      outcome: "out_of_order",
    });
    expect(receiver.processedEvents).toHaveLength(1);
  });

  test("rejects invalid signatures before parsing the payload", () => {
    const receiver = new WebhookReceiver({ secret });

    expect(receiver.handle("not-json", "sha256=invalid")).toMatchObject({
      status: 401,
      outcome: "invalid_signature",
    });
  });

  test("rejects a signed payload with an invalid event shape", () => {
    const receiver = new WebhookReceiver({ secret });
    const payload = JSON.stringify({ id: "evt_001" });

    expect(receiver.handle(payload, signPayload(payload, secret))).toMatchObject({
      status: 400,
      outcome: "invalid_payload",
    });
  });
});
