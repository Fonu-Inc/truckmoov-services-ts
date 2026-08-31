# AI routing and governance

## Decision

TruckMoov should use an OpenRouter-style control plane rather than coupling a
feature directly to one model vendor. A user request is routed through a
platform policy layer, then to an eligible agent, provider, and model. The
feature owns the task contract; the router owns selection, fallback, budget,
and audit decisions.

## Request flow

1. A feature submits an `AgentRequest` containing the tenant, feature key,
   user, task input, and optional agent preference.
2. The router loads the effective platform and tenant policy.
3. Policy evaluation rejects disabled features, disallowed providers/models,
   region violations, and budget violations before any provider call.
4. The router ranks eligible agents, then their configured provider/model
   routes, and tries them in order within the request budget.
5. The result records the selected agent, provider, model, fallback attempt,
   token usage, latency, and outcome in an append-only usage record.
6. The feature receives a typed result or a typed unavailable/error result; it
   never receives provider credentials.

## Core concepts

- `AgentDefinition`: stable key, display name, feature keys, provider/model
  routes, enabled state, and priority.
- `ProviderDefinition`: provider key, enabled state, encrypted credential
  reference, allowed models, region, and health state.
- `AgentRoute`: agent key, provider key, model, priority, and fallback flag.
- `AiPolicy`: master switch, feature defaults, spend/request limits, region
  restrictions, and block/warn behavior.
- `AiUsage`: tenant, feature, agent, provider, model, request ID, token counts,
  cost, wallet reference, latency, and outcome.

## User routing

Users may select an agent only from the agents enabled for their tenant and
feature. A user preference is a routing hint, not an authorization bypass.
The server still enforces platform policy, tenant entitlements, provider
allowlists, and spend limits. If no preference is supplied, the platform
default agent for the feature is used.

## Administration boundary

Provider credentials, agent routes, models, guardrails, and defaults are
platform-admin configuration. General users can submit feature requests and,
where the feature allows it, choose from the server-provided eligible agent
list; they cannot write provider credentials or bypass policy.

## Initial implementation boundary

Start with a provider-neutral router and the existing waybill-extraction port
as the first governed call site. Keep provider adapters behind ports so an
OpenAI-compatible endpoint, Anthropic, Gemini, or another gateway can be
added without changing feature code. Wallet charging must happen only after a
provider request is accepted and must carry the same request ID as `AiUsage`.
