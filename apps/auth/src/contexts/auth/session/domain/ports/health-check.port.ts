export type AuthHealthStatus = {
  service: string;
  persistenceBackend: string;
  database: "up" | "n/a";
};

export interface AuthHealthCheck {
  check(): Promise<AuthHealthStatus>;
}

export const AUTH_HEALTH_CHECK = Symbol("AUTH_HEALTH_CHECK");
