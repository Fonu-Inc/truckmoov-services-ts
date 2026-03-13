export type AuthUserProps = {
  id: string;
  email: string;
  roles: string[];
  tenantId: string;
};

export class AuthUser {
  private constructor(private readonly props: AuthUserProps) {}

  static create(props: AuthUserProps): AuthUser {
    if (!props.email.trim()) {
      throw new Error("email is required");
    }
    if (!props.roles.length) {
      throw new Error("roles are required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }

    return new AuthUser({
      id: props.id,
      email: props.email.trim(),
      roles: [...props.roles],
      tenantId: props.tenantId.trim(),
    });
  }

  get id() {
    return this.props.id;
  }

  get email() {
    return this.props.email;
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
      email: this.email,
      roles: this.roles,
      tenantId: this.tenantId,
    };
  }
}
