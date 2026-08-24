import { afterEach, describe, expect, test } from "vitest";

import { WebhookDelivery } from "../src/delivery.js";
import { WebhookReceiver } from "../src/receiver.js";
import { startReceiverServer } from "../src/server.js";
import type { WebhookEvent } from "../src/types.js";

const secret = "test-secret";
const servers: Array<{ close: () => Promise<void> }> = [];

const event: WebhookEvent = {
  id: "evt_001",
  type: "appointment.created",
  aggregateId: "appointment_101",
  sequence: 1,
  occurredAt: "2026-08-25T09:00:00.000Z",
  data: { attendee: "person@example.test" },
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("webhook delivery", () => {
  test("retries transient failures and eventually succeeds", async () => {
    const receiver = new WebhookReceiver({ secret, transientFailures: 2 });
    const server = await startReceiverServer(receiver);
    servers.push(server);
    const observedDelays: number[] = [];
    const delivery = new WebhookDelivery({
      secret,
      maximumAttempts: 4,
      baseDelayMilliseconds: 10,
      wait: async (milliseconds) => {
        observedDelays.push(milliseconds);
      },
    });

    const report = await delivery.deliver(server.url, event);

    expect(report.succeeded).toBe(true);
    expect(report.attempts.map(({ status }) => status)).toEqual([503, 503, 200]);
    expect(observedDelays).toEqual([10, 20]);
    expect(receiver.processedEvents).toHaveLength(1);
  });

  test("does not retry a non-retryable client response", async () => {
    const receiver = new WebhookReceiver({ secret: "different-secret" });
    const server = await startReceiverServer(receiver);
    servers.push(server);
    const delivery = new WebhookDelivery({ secret, maximumAttempts: 3 });

    const report = await delivery.deliver(server.url, event);

    expect(report.succeeded).toBe(false);
    expect(report.attempts).toHaveLength(1);
    expect(report.attempts[0]).toMatchObject({
      status: 401,
      outcome: "invalid_signature",
    });
  });

  test("does not require an error response to contain JSON", async () => {
    const fetchImplementation = (async () =>
      new Response("Bad request", { status: 400 })) as typeof fetch;
    const delivery = new WebhookDelivery({
      secret,
      maximumAttempts: 3,
      fetchImplementation,
    });

    const report = await delivery.deliver("https://example.test", event);

    expect(report.succeeded).toBe(false);
    expect(report.attempts).toEqual([{ number: 1, status: 400 }]);
  });

  test("reports failure after exhausting the retry limit", async () => {
    const receiver = new WebhookReceiver({ secret, transientFailures: 4 });
    const server = await startReceiverServer(receiver);
    servers.push(server);
    const delivery = new WebhookDelivery({
      secret,
      maximumAttempts: 3,
      baseDelayMilliseconds: 0,
    });

    const report = await delivery.deliver(server.url, event);

    expect(report.succeeded).toBe(false);
    expect(report.attempts.map(({ status }) => status)).toEqual([503, 503, 503]);
    expect(receiver.processedEvents).toHaveLength(0);
  });

  test("a repeated successful delivery remains idempotent", async () => {
    const receiver = new WebhookReceiver({ secret });
    const server = await startReceiverServer(receiver);
    servers.push(server);
    const delivery = new WebhookDelivery({ secret });

    const first = await delivery.deliver(server.url, event);
    const duplicate = await delivery.deliver(server.url, event);

    expect(first.attempts[0]?.outcome).toBe("processed");
    expect(duplicate.attempts[0]?.outcome).toBe("duplicate");
    expect(receiver.processedEvents).toHaveLength(1);
  });
});
