export type AuthUserProps = {
  id: string;
  email: string;
  role: string;
  tenantId: string;
};

export class AuthUser {
  private constructor(private readonly props: AuthUserProps) {}

  static create(props: AuthUserProps): AuthUser {
    if (!props.email.trim()) {
      throw new Error("email is required");
    }
    if (!props.role.trim()) {
      throw new Error("role is required");
    }
    if (!props.tenantId.trim()) {
      throw new Error("tenantId is required");
    }

    return new AuthUser({
      id: props.id,
      email: props.email.trim(),
      role: props.role.trim(),
      tenantId: props.tenantId.trim(),
    });
  }

  get id() {
    return this.props.id;
  }

  get email() {
    return this.props.email;
  }

  get role() {
    return this.props.role;
  }

  get tenantId() {
    return this.props.tenantId;
  }

  toPrimitives(): AuthUserProps {
    return {
      id: this.id,
      email: this.email,
      role: this.role,
      tenantId: this.tenantId,
    };
  }
}
