/**
 * The submitted token is a pending invite token, not an email verification
 * token. Both are issued as opaque UUIDs, so without this distinction the
 * caller cannot tell a wrong-kind token from an expired one.
 */
export class TokenBelongsToInviteError extends Error {
  constructor() {
    super(
      "That link is an invitation. Accept the invitation instead of completing a profile.",
    );
  }
}
