// Nest relies on emitted decorator metadata for DI in test bootstrap paths.
import "reflect-metadata";

// Vitest sets NODE_ENV=test; backend runtime only supports development/production.
process.env.NODE_ENV = "development";
