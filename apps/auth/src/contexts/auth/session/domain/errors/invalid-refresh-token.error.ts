export class InvalidRefreshTokenError extends Error {
  constructor(readonly code: "invalid_refresh" | "refresh_reused" = "invalid_refresh") {
    super("Invalid refresh token");
    this.name = "InvalidRefreshTokenError";
  }
}
