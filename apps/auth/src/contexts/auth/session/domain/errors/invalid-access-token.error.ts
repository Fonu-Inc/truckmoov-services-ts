export class InvalidAccessTokenError extends Error {
  constructor(msg = "Invalid or expired access token") {
    super(msg);
    this.name = "InvalidAccessTokenError";
  }
}
