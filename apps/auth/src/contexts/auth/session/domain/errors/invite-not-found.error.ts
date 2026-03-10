export class InviteNotFoundError extends Error {
  constructor() {
    super("Invite not found or expired");
    this.name = "InviteNotFoundError";
  }
}
