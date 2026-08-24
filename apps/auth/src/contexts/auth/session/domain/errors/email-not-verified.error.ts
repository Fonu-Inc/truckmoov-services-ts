export class EmailNotVerifiedError extends Error {
  constructor() {
    super("Verify your email address before you sign in. Check your inbox for the link.");
  }
}
