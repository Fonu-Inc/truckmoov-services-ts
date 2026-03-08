# EventBus abstraction

Preferred async/eventing transport: **NATS JetStream**.
MVP fallback: Redis Streams.

## Why an abstraction
We want to keep business logic stable if enterprise constraints force a different broker.

## Interface (suggested)
- `Publish(ctx, subject, envelope) error`
- `Subscribe(subject, handler) (Subscription, error)`
- `Ack/Nack` semantics for durable consumers

## Envelope
See root `EVENTS.md` for the recommended envelope.
