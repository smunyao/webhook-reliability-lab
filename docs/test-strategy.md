# Webhook reliability test strategy

## Purpose

This strategy explains how the lab turns webhook reliability risks into proportionate test evidence. It is an account of the current implementation, not a claim that the lab is production infrastructure.

The central question is:

> Can a signed event cross an unreliable HTTP boundary without being accepted from an untrusted sender, silently lost after a temporary failure or processed more than once?

The automated suite answers selected repeatable parts of that question. The remaining sections make the boundaries, investigative work and unresolved risks explicit.

## System context and boundaries

The lab contains four relevant boundaries:

1. `WebhookDelivery` serialises and signs an event, sends it over HTTP and decides whether another attempt is justified.
2. The HTTP server accepts only `POST /webhooks`, limits payload size and passes the exact received bytes and signature to the receiver.
3. `WebhookReceiver` verifies trust before parsing, validates the event, detects duplicate identifiers and applies an ordering policy per aggregate.
4. In-memory state records processed identifiers, latest sequences and accepted events for the lifetime of one process.

The external network, durable storage, queues, secret management and operational monitoring are outside the implementation. Their absence is part of the risk assessment rather than something the tests conceal.

## Quality objectives

The lab prioritises five outcomes:

- an altered, unsigned or incorrectly signed payload is never processed;
- a valid event is processed no more than once within the lifetime of the receiver;
- a temporary delivery failure receives a bounded retry and can recover;
- a permanent client failure stops rather than creating repeated traffic;
- an older sequence cannot overwrite the state established by a newer event for the same aggregate.

These outcomes are more important than maximising the number of tests. Each check should provide distinct information about one of them or about a boundary on which they depend.

## Risk assessment

Priority is qualitative. **High** represents behaviour that could undermine trust in processing or create a significant incorrect side effect. **Medium** represents behaviour that affects reliability or diagnosis but is contained within this lab. Likelihood reflects how naturally the condition arises in webhook delivery, not production incident data.

| Risk | Impact | Likelihood | Current control and evidence | Residual uncertainty |
| --- | --- | --- | --- | --- |
| A forged or altered payload is processed | High | Medium | HMAC verification uses timing-safe comparison; signature and receiver tests cover changed, missing and malformed signatures | Secret storage, rotation and compromise are outside the lab |
| A duplicate delivery repeats a side effect | High | High | Processed event identifiers make handling idempotent; receiver and real-HTTP delivery tests verify one accepted event | State is lost on restart and concurrent or distributed receivers are not modelled |
| A temporary failure causes a valid event to be lost | High | Medium | Network errors, `429` and `5xx` are retryable in the delivery policy; real-HTTP tests cover repeated `503` responses and eventual success | Direct automated examples for network failure and `429` are not currently present |
| Retry behaviour amplifies an outage | High | Medium | Attempts are bounded and exponential delay is verified | There is no jitter, request timeout, `Retry-After` support or shared retry budget |
| A permanent client failure is retried | Medium | Medium | Non-retryable responses stop delivery; a real-HTTP invalid-signature response verifies the decision | Other representative `4xx` statuses are not individually exercised |
| Invalid event data reaches processing | High | Medium | Trust is checked before parsing and the receiver validates the event shape | Validation is deliberately small and does not model schema evolution |
| An older event replaces newer aggregate state | High | Medium | Latest sequence is tracked per aggregate and stale sequences are rejected in a receiver test | Buffering, reconciliation, missing sequences and concurrent arrival are not implemented |
| An oversized request consumes excessive memory | Medium | Low | The HTTP boundary stops reading beyond 1 MB and returns `413` | The limit and slow request behaviour do not yet have automated integration coverage |
| A failure cannot be diagnosed | Medium | Medium | Delivery reports retain every attempt, status, receiver outcome or network error | There are no structured logs, metrics, traces or durable audit records |

## Test approach

### Component evidence

Component checks isolate deterministic decisions and keep failures precise:

- [`tests/signatures.spec.ts`](../tests/signatures.spec.ts) verifies unchanged bytes and rejects altered, absent or malformed signatures.
- [`tests/receiver.spec.ts`](../tests/receiver.spec.ts) verifies accepted events, duplicate handling, stale sequences, trust-before-parsing and event-shape validation.

These checks are the right level for cryptographic and state-transition rules because HTTP adds no useful information to every example.

### HTTP integration evidence

[`tests/delivery.spec.ts`](../tests/delivery.spec.ts) uses an ephemeral local HTTP server. It verifies that separately tested parts still cooperate across the real transport boundary, including:

- recovery after two transient `503` responses;
- exponential delays between attempts;
- stopping after a non-retryable authentication response;
- handling an error response without assuming JSON;
- failure after the retry limit;
- idempotency across repeated successful deliveries.

The suite does not call a third-party service. Controlling both ends keeps failure conditions reproducible and avoids mistaking external availability for product evidence.

### Executable scenario

[`src/scenario.ts`](../src/scenario.ts) provides a small system-level demonstration. The receiver fails twice, accepts the third attempt and then acknowledges a duplicate without processing it again. Its attempt tables are useful for human inspection, but the scenario does not replace assertions in the automated suite.

## Exploratory charters

The following charters identify investigation that benefits from observation and variation. They are proposed guides, not claims that every variation has already been executed.

### Retry classification and reporting

Vary network errors and `400`, `401`, `409`, `429` and `5xx` responses. Observe whether the sender retries only transient conditions, records every attempt accurately and stops at the configured limit. Pay particular attention to malformed or empty response bodies.

### Duplicate identity and receiver lifetime

Repeat an event before and after other events, vary its payload while retaining its identifier, and restart the receiver between deliveries. Observe where idempotency guarantees begin and end and whether the reported outcome could mislead a caller.

### Ordering across aggregates

Deliver gaps, repeated sequences and stale events across one and multiple aggregate identifiers. Investigate whether one aggregate can influence another and document where buffering or reconciliation would be required in a fuller system.

### Payload trust and HTTP boundaries

Change whitespace and property order before and after signing; send malformed JSON, incomplete event shapes, oversized bodies and unexpected methods or routes. Observe whether rejection happens at the intended boundary and whether untrusted data can affect state.

### Slow and unavailable dependencies

Delay a response, refuse a connection and leave a request unresolved. Observe the absence of a request timeout and consider how retries could overlap or consume resources. This charter intentionally exposes a known limitation rather than asserting resilience the lab does not implement.

## Automation boundaries

Automation is retained when a condition is deterministic, repeatable and produces a clear assertion. The suite therefore covers core trust, state and retry decisions.

The suite deliberately does not attempt to prove:

- durable idempotency across restarts or multiple receiver instances;
- queue delivery, dead-letter handling or replay;
- secret storage and rotation;
- production network behaviour, latency or throughput;
- compatibility with a real webhook provider;
- operational alerting or recovery procedures.

Those behaviours require architecture the lab does not contain. Adding mocks for them would create the appearance of coverage without exercising a real boundary.

## Observability and failure investigation

Every delivery returns a report containing the event identifier, overall result and ordered attempts. Each attempt records a response status and receiver outcome when available, or a network error. The scenario renders those attempts so retry behaviour can be inspected directly.

This is adequate for the investigation, but not for operating a service. A production design would need correlation identifiers, structured logs, metrics for attempts and outcomes, durable delivery state and enough context to distinguish delayed, duplicated and permanently failed events.

## Residual risk and completion boundary

The current evidence supports the bounded behaviours implemented in this repository. It does not establish production readiness.

The most material residual risks are volatile idempotency state, absent request timeouts, simplistic retry timing, no replay or dead-letter path, no secret rotation and limited operational visibility. They are accepted because resolving them would turn a small reliability investigation into a different system.

For version 0.1, the strategy is complete when:

- each priority behaviour maps to implementation or an explicit limitation;
- automated checks cover the core trust, idempotency, ordering and bounded-retry decisions;
- the executable scenario demonstrates recovery and duplicate handling together;
- unimplemented production concerns remain visible rather than implied by broad claims.

Future changes should update the risk table and the relevant evidence link whenever they alter retry classification, receiver state, event validation, ordering or the HTTP boundary.
