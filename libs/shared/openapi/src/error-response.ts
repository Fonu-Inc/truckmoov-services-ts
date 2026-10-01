import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Documents ApiErrorBody, the error half of the response contract. */
export class ErrorResponse {
  @ApiProperty({ enum: [false], example: false }) status!: false;
  @ApiProperty({ example: "Application not found", description: "The one line a client shows." })
  message!: string;
  @ApiProperty({ example: "Not Found", description: "HTTP status text." }) error!: string;
  @ApiProperty({ example: 404 }) statusCode!: number;
  @ApiPropertyOptional({
    type: [String],
    example: ["property foo should not exist"],
    description: "Every problem when there is more than one, such as each rejected property.",
  })
  errors?: string[];
}
