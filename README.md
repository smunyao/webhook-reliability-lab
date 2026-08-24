# Webhook Reliability Lab

A small TypeScript project for investigating webhook behaviour across an unreliable system boundary.

The lab delivers signed webhook events to a receiver and makes several common failure modes reproducible: temporary unavailability, duplicate delivery, invalid signatures and out-of-order events. It is intentionally a learning and testing artefact rather than a production webhook platform.

## The problem

A webhook sender usually knows that an HTTP request received a response. That response does not, by itself, prove that the complete customer workflow succeeded.

Temporary failures may require a retry. A retry may deliver the same event more than once. Events may arrive in a different order from the one in which they were created. A receiver also needs to distinguish a trusted payload from a request sent by somebody else.

This project provides a controlled place to examine those behaviours and the evidence different tests can provide.

## What the lab demonstrates

- HMAC SHA-256 payload signing and timing-safe signature verification
- Retry of network failures, `429` responses and `5xx` responses
- Exponential delay between attempts
- Idempotent handling of duplicate event identifiers
- Detection of stale event sequences for the same aggregate
- Validation before processing
- Real HTTP integration tests using an ephemeral local server
- A visible delivery report for each attempt

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

The HTTP server is deliberately thin. Delivery policy belongs to `WebhookDelivery`; event acceptance and state belong to `WebhookReceiver`. Keeping those responsibilities separate makes the core behaviour fast to test while retaining representative HTTP coverage.

## Run the project

Requires Node.js 24 or later.

```bash
npm install
npm test
npm run build
npm run scenario
```

The scenario configures the receiver to fail twice before succeeding. It then delivers the same event again to demonstrate that the receiver acknowledges the duplicate without processing it twice.

## Testing strategy

The suite uses different boundaries for different questions:

- Signature tests exercise cryptographic behaviour without HTTP.
- Receiver tests exercise validation, idempotency and ordering as deterministic domain behaviour.
- Delivery tests use a real local HTTP server to verify retries, response classification and the assembled workflow.

The suite does not send traffic to a third-party service. Doing so would make results depend on an environment the project does not control and would not improve the evidence required for these scenarios.

## Decisions and trade-offs

### Sign the exact payload bytes

The sender signs the same serialized payload that it transmits. The receiver verifies those bytes before parsing JSON. Parsing and re-serializing first could change whitespace or property ordering and reject an otherwise authentic request.

### A duplicate is acknowledged successfully

Returning a successful response prevents a sender from retrying an event the receiver has already processed. The outcome remains visible as `duplicate`, but the side effect is not repeated.

### Only transient responses are retried

Network errors, `429` and `5xx` responses may succeed later. Other `4xx` responses indicate that sending the same request again is unlikely to help, so delivery stops.

### Out-of-order events are rejected

The lab rejects a sequence older than the latest processed sequence for an aggregate. A production system might instead buffer, reconcile or safely ignore stale events. Rejection keeps that policy explicit; it is not presented as the only correct design.

## Deliberate limitations

- State is held in memory and is lost when the process exits.
- The sender and receiver share one configured secret; there is no key rotation.
- Retries have no jitter and do not honour `Retry-After`.
- Delivery requests do not currently enforce a timeout.
- Events use one simplified schema and one fictional appointment workflow.
- There is no queue, dead-letter store or replay interface.
- The sequence policy assumes one ordered stream per aggregate.
- The lab does not claim production readiness or performance characteristics.

These constraints keep the project small enough to inspect. They also identify realistic directions for further investigation without building speculative infrastructure into the first version.
