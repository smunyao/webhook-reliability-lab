import { verifySignature } from "./signatures.js";
import type {
  ReceiverResponse,
  WebhookEvent,
} from "./types.js";

type ReceiverOptions = {
  secret: string;
  transientFailures?: number;
};

function isWebhookEvent(value: unknown): value is WebhookEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Partial<WebhookEvent>;

  return (
    typeof event.id === "string" &&
    typeof event.type === "string" &&
    typeof event.aggregateId === "string" &&
    typeof event.sequence === "number" &&
    Number.isInteger(event.sequence) &&
    event.sequence > 0 &&
    typeof event.occurredAt === "string" &&
    !Number.isNaN(Date.parse(event.occurredAt)) &&
    Boolean(event.data) &&
    typeof event.data === "object" &&
    !Array.isArray(event.data)
  );
}

export class WebhookReceiver {
  readonly processedEvents: WebhookEvent[] = [];

  private readonly secret: string;
  private readonly processedEventIds = new Set<string>();
  private readonly latestSequences = new Map<string, number>();
  private transientFailuresRemaining: number;

  constructor({ secret, transientFailures = 0 }: ReceiverOptions) {
    this.secret = secret;
    this.transientFailuresRemaining = transientFailures;
  }

  handle(payload: string, signature: string | undefined): ReceiverResponse {
    if (!verifySignature(payload, signature, this.secret)) {
      return {
        status: 401,
        outcome: "invalid_signature",
        message: "The webhook signature could not be verified.",
      };
    }

    let candidate: unknown;

    try {
      candidate = JSON.parse(payload);
    } catch {
      return {
        status: 400,
        outcome: "invalid_payload",
        message: "The webhook body is not valid JSON.",
      };
    }

    if (!isWebhookEvent(candidate)) {
      return {
        status: 400,
        outcome: "invalid_payload",
        message: "The webhook body does not match the expected event shape.",
      };
    }

    if (this.processedEventIds.has(candidate.id)) {
      return {
        status: 200,
        outcome: "duplicate",
        message: "The event has already been processed.",
      };
    }

    if (this.transientFailuresRemaining > 0) {
      this.transientFailuresRemaining -= 1;

      return {
        status: 503,
        outcome: "transient_failure",
        message: "The receiver is temporarily unavailable.",
      };
    }

    const latestSequence = this.latestSequences.get(candidate.aggregateId) ?? 0;

    if (candidate.sequence <= latestSequence) {
      return {
        status: 409,
        outcome: "out_of_order",
        message: `Sequence ${candidate.sequence} follows sequence ${latestSequence}.`,
      };
    }

    this.processedEventIds.add(candidate.id);
    this.latestSequences.set(candidate.aggregateId, candidate.sequence);
    this.processedEvents.push(candidate);

    return {
      status: 200,
      outcome: "processed",
      message: "The event was processed.",
    };
  }
}
