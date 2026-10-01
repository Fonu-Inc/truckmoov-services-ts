import { BadRequestException, HttpException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { toErrorBody } from "@shared/openapi";

describe("toErrorBody", () => {
  it("answers an HttpException in the contract", () => {
    expect(toErrorBody(new NotFoundException("Application not found"))).toEqual({
      status: false,
      message: "Application not found",
      error: "Not Found",
      statusCode: 404,
    });
  });

  // ValidationPipe throws one message per property. message stays a string a
  // client can show; the full list moves to errors.
  it("keeps message a string and lists every validation problem", () => {
    const body = toErrorBody(new BadRequestException(["property foo should not exist", "name must be a string"]));

    expect(body).toMatchObject({ status: false, message: "property foo should not exist", statusCode: 400, error: "Bad Request" });
    expect(body.errors).toEqual(["property foo should not exist", "name must be a string"]);
  });

  it("carries an error's own detail fields", () => {
    const body = toErrorBody(new BadRequestException({ message: "Organization name is required", field: "organizationName" }));

    expect(body).toMatchObject({ status: false, message: "Organization name is required", field: "organizationName", statusCode: 400 });
  });

  it("names the status even for a bare HttpException", () => {
    expect(toErrorBody(new HttpException("Too many requests", 429))).toMatchObject({ error: "Too Many Requests", statusCode: 429 });
  });

  it("hides an unexpected error behind a 500", () => {
    expect(toErrorBody(new Error("db password is hunter2"))).toEqual({
      status: false,
      message: "Internal server error",
      error: "Internal Server Error",
      statusCode: 500,
    });
  });
});
