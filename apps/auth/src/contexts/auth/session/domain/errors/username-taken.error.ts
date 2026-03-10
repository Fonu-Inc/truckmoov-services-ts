export class UsernameTakenError extends Error {
  constructor() { super("username already taken"); }
}
