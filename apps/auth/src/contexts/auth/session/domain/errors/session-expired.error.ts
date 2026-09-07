export class SessionExpiredError extends Error {
  constructor(readonly idleMinutes: number) {
    super(`This session was idle for ${idleMinutes} minutes and has been signed out`);
    this.name = "SessionExpiredError";
  }
}
