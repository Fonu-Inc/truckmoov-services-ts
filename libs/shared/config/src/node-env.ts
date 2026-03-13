export enum NodeEnv {
  Development = "development",
  Production = "production",
}

const NODE_ENV_SET = new Set<string>(Object.values(NodeEnv));

export function parseNodeEnv(value: unknown): NodeEnv {
  const env = typeof value === "string" && value.length > 0 ? value : NodeEnv.Development;

  if (NODE_ENV_SET.has(env)) {
    return env as NodeEnv;
  }

  throw new Error(`Invalid NODE_ENV value "${String(value)}". Expected one of: ${Object.values(NodeEnv).join(", ")}`);
}
