export type WebhookEvent<TData extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  type: string;
  aggregateId: string;
  sequence: number;
  occurredAt: string;
  data: TData;
};

export type ReceiverOutcome =
  | "processed"
  | "duplicate"
  | "invalid_signature"
  | "invalid_payload"
  | "out_of_order"
  | "transient_failure";

export type ReceiverResponse = {
  status: number;
  outcome: ReceiverOutcome;
  message: string;
};

export type DeliveryAttempt = {
  number: number;
  status?: number;
  outcome?: ReceiverOutcome;
  error?: string;
};

export type DeliveryReport = {
  eventId: string;
  succeeded: boolean;
  attempts: DeliveryAttempt[];
};
