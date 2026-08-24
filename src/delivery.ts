import { signPayload } from "./signatures.js";
import type {
  DeliveryAttempt,
  DeliveryReport,
  ReceiverOutcome,
  WebhookEvent,
} from "./types.js";

type DeliveryOptions = {
  secret: string;
  maximumAttempts?: number;
  baseDelayMilliseconds?: number;
  fetchImplementation?: typeof fetch;
  wait?: (milliseconds: number) => Promise<void>;
};

const defaultWait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

export class WebhookDelivery {
  private readonly secret: string;
  private readonly maximumAttempts: number;
  private readonly baseDelayMilliseconds: number;
  private readonly fetchImplementation: typeof fetch;
  private readonly wait: (milliseconds: number) => Promise<void>;

  constructor({
    secret,
    maximumAttempts = 3,
    baseDelayMilliseconds = 100,
    fetchImplementation = fetch,
    wait = defaultWait,
  }: DeliveryOptions) {
    if (maximumAttempts < 1) {
      throw new Error("maximumAttempts must be at least 1.");
    }

    this.secret = secret;
    this.maximumAttempts = maximumAttempts;
    this.baseDelayMilliseconds = baseDelayMilliseconds;
    this.fetchImplementation = fetchImplementation;
    this.wait = wait;
  }

  async deliver(url: string, event: WebhookEvent): Promise<DeliveryReport> {
    const payload = JSON.stringify(event);
    const signature = signPayload(payload, this.secret);
    const attempts: DeliveryAttempt[] = [];

    for (let attemptNumber = 1; attemptNumber <= this.maximumAttempts; attemptNumber += 1) {
      try {
        const response = await this.fetchImplementation(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
          },
          body: payload,
        });
        let outcome: ReceiverOutcome | undefined;

        try {
          const body = (await response.json()) as { outcome?: ReceiverOutcome };
          outcome = body.outcome;
        } catch {
          // Response classification depends on the status, not a JSON body.
        }

        attempts.push({
          number: attemptNumber,
          status: response.status,
          ...(outcome ? { outcome } : {}),
        });

        if (response.ok) {
          return { eventId: event.id, succeeded: true, attempts };
        }

        if (!shouldRetry(response.status)) {
          break;
        }
      } catch (error) {
        attempts.push({
          number: attemptNumber,
          error: error instanceof Error ? error.message : "Unknown network error",
        });
      }

      if (attemptNumber < this.maximumAttempts) {
        const delay = this.baseDelayMilliseconds * 2 ** (attemptNumber - 1);
        await this.wait(delay);
      }
    }

    return { eventId: event.id, succeeded: false, attempts };
  }
}
