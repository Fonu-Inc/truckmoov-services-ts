export class SessionExpiredError extends Error {
  readonly code = "session_idle";

  constructor(readonly idleMinutes: number) {
    super(`This session was idle for ${idleMinutes} minutes and has been signed out`);
    this.name = "SessionExpiredError";
  }
}
