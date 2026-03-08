export type EventEnvelope<TData = Record<string, unknown>> = {
  id: string;
  type: string;
  version: number;
  occurred_at: string;
  tenant_id: string;
  correlation_id?: string;
  actor?: Record<string, unknown>;
  data: TData;
};
