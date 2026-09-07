import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  /** The caller's address, when it could be established honestly. */
  ipAddress: string | null;
};

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Per-request detail the activity log needs but the caller does not pass.
 *
 * Held in async storage rather than threaded through every controller: the
 * activity log is a singleton called from around thirty places, and adding a
 * request argument to all of them to carry one field would be a change with
 * no upside and thirty chances to forget.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestContext(): RequestContext | null {
  return storage.getStore() ?? null;
}
