// Nest relies on emitted decorator metadata for DI in test bootstrap paths.
import "reflect-metadata";

// Vitest sets NODE_ENV=test; backend runtime only supports development/production.
process.env.NODE_ENV = "development";

// The tests have no shared Redis; counters there would also outlive a run.
process.env.REDIS_ENABLED = "false";
