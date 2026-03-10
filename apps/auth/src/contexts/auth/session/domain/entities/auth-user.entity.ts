export type AuthUserProps = {
  id: string;
  username: string;
  roles: string[];
  tenantId: string;
};

export class AuthUser {
  private constructor(private readonly props: AuthUserProps) {}

  static create(props: AuthUserProps): AuthUser {
    if (!props.username.trim()) {
      throw new Error("username is required");
    }
    if (!props.roles.length) {
      throw new Error("roles are required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }

    return new AuthUser({
      id: props.id,
      username: props.username.trim(),
      roles: [...props.roles],
      tenantId: props.tenantId.trim(),
    });
  }

  get id() {
    return this.props.id;
  }

  get username() {
    return this.props.username;
  }

  get roles() {
    return [...this.props.roles];
  }

  get tenantId() {
    return this.props.tenantId;
  }

  toPrimitives(): AuthUserProps {
    return {
      id: this.id,
      username: this.username,
      roles: this.roles,
      tenantId: this.tenantId,
    };
  }
}
