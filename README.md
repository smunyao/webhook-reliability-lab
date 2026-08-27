# Webhook Reliability Lab

A small TypeScript project for investigating signed webhook delivery across an unreliable system boundary.

The lab makes temporary failure, duplicate delivery, invalid signatures and out-of-order events reproducible. Version 0.1 is a complete first investigation and an inspectable testing artefact, not a production webhook platform.

## What the lab demonstrates

- HMAC SHA-256 payload signing and timing-safe verification
- Retry of network failures, `429` responses and `5xx` responses
- Exponential delay between attempts
- Idempotent handling of duplicate event identifiers
- Detection of stale event sequences for the same aggregate
- Validation before processing
- Real HTTP integration tests using an ephemeral local server
- A visible report for every delivery attempt

## Technical foundation

- TypeScript and Node.js
- Vitest
- Native Node.js HTTP and cryptography APIs
- Real local HTTP integration testing

## Architecture

```text
Scenario or test
      |
      v
WebhookDelivery -- signed HTTP POST --> Receiver server
                                             |
                                             v
                                      WebhookReceiver
                                      - verify signature
                                      - validate payload
                                      - detect duplicate
                                      - check sequence
                                      - process event
```

Delivery and retry policy belong to `WebhookDelivery`; event acceptance and state belong to `WebhookReceiver`. The HTTP server remains deliberately thin so the domain behaviour stays fast to test while representative workflows retain real HTTP coverage.

## Inspect the repository

| Path | Responsibility |
| --- | --- |
| [`src/types.ts`](src/types.ts) | Event and delivery contracts |
| [`src/signatures.ts`](src/signatures.ts) | Payload signing and timing-safe verification |
| [`src/delivery.ts`](src/delivery.ts) | Delivery attempts and retry policy |
| [`src/receiver.ts`](src/receiver.ts) | Validation, idempotency and event ordering |
| [`src/server.ts`](src/server.ts) | HTTP boundary |
| [`src/scenario.ts`](src/scenario.ts) | Retries and duplicate handling working together |
| [`docs/test-strategy.md`](docs/test-strategy.md) | Risk model, coverage decisions, exploratory charters and residual uncertainty |

The tests follow the same boundaries: signature trust in [`tests/signatures.spec.ts`](tests/signatures.spec.ts), receiver behaviour in [`tests/receiver.spec.ts`](tests/receiver.spec.ts), and retry policy through a local HTTP server in [`tests/delivery.spec.ts`](tests/delivery.spec.ts).

## Run the project

Node.js 24 or later is required.

```bash
npm install
npm test
npm run build
npm run scenario
```

The scenario fails twice before succeeding, then delivers the same event again to show that the receiver acknowledges a duplicate without processing it twice.

## Testing strategy

The full [test strategy](docs/test-strategy.md) connects system risks to the implemented checks, exploratory charters and deliberate limits of the lab.

- Signature tests exercise cryptographic behaviour without HTTP.
- Receiver tests keep validation, idempotency and ordering deterministic.
- Delivery tests use a real local HTTP server to verify retries, response classification and the assembled workflow.

The suite deliberately avoids third-party traffic so results do not depend on an environment the project cannot control.

## Decisions and trade-offs

- **Sign the exact payload bytes.** Verifying before JSON parsing avoids changes to whitespace or property order invalidating an authentic request.
- **Acknowledge duplicates successfully.** The receiver reports `duplicate` without repeating the side effect or inviting another retry.
- **Retry only transient failures.** Network errors, `429` and `5xx` responses may succeed later; other `4xx` responses stop delivery.
- **Reject stale event sequences.** A production system might buffer or reconcile them, but rejection keeps this lab's ordering policy explicit.

## Deliberate limitations

- State is held in memory and is lost when the process exits.
- The sender and receiver share one secret; there is no key rotation.
- Retries have no jitter and do not honour `Retry-After`.
- Delivery requests do not enforce a timeout.
- Events use one simplified schema and a fictional appointment workflow.
- There is no queue, dead-letter store or replay interface.
- The lab makes no production-readiness or performance claims.

These constraints keep the project small enough to inspect while leaving realistic directions for future investigation.

## Related work

The lab is presented as inspectable engineering work in [Kitaka Munyao's portfolio](https://kitakamunyao.com/#engineering-work).

## Licence

The source code is available under the [MIT License](LICENSE).
