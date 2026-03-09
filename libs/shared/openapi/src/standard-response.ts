import { ApiProperty } from "@nestjs/swagger";

export class StandardApiResponse<T = unknown> {
  @ApiProperty({ description: "Whether the operation succeeded" })
  status!: boolean;

  @ApiProperty({ description: "Human-readable result message" })
  message!: string;

  @ApiProperty({ description: "Response payload" })
  data!: T;

  static ok<T>(data: T, message = "success"): StandardApiResponse<T> {
    return Object.assign(new StandardApiResponse<T>(), { status: true, message, data });
  }

  static fail(message: string): StandardApiResponse<null> {
    return Object.assign(new StandardApiResponse<null>(), { status: false, message, data: null });
  }
}
