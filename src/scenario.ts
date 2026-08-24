import { WebhookDelivery } from "./delivery.js";
import { WebhookReceiver } from "./receiver.js";
import { startReceiverServer } from "./server.js";
import type { WebhookEvent } from "./types.js";

const secret = "local-demo-secret";
const receiver = new WebhookReceiver({ secret, transientFailures: 2 });
const server = await startReceiverServer(receiver);
const delivery = new WebhookDelivery({
  secret,
  maximumAttempts: 4,
  baseDelayMilliseconds: 50,
});

const event: WebhookEvent = {
  id: "evt_001",
  type: "appointment.created",
  aggregateId: "appointment_101",
  sequence: 1,
  occurredAt: new Date().toISOString(),
  data: {
    startsAt: "2026-08-25T09:00:00.000Z",
    attendee: "person@example.test",
  },
};

try {
  const firstDelivery = await delivery.deliver(server.url, event);
  const duplicateDelivery = await delivery.deliver(server.url, event);

  console.log("First delivery");
  console.table(firstDelivery.attempts);
  console.log("Duplicate delivery");
  console.table(duplicateDelivery.attempts);
  console.log(`Events processed: ${receiver.processedEvents.length}`);
} finally {
  await server.close();
}
