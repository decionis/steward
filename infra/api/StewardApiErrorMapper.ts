import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  StewardForbiddenError,
  StewardGatewayError,
  StewardNotFoundError,
  StewardUnauthorizedError,
  StewardUnavailableError,
} from "@/infra/errors/StewardErrors";

export class StewardApiErrorMapper {
  static toResponse(error: unknown): NextResponse {
    if (error instanceof StewardUnauthorizedError) {
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: error.message },
        { status: 401 },
      );
    }
    if (error instanceof StewardForbiddenError) {
      return NextResponse.json(
        { error: "FORBIDDEN", message: error.message },
        { status: 403 },
      );
    }
    if (error instanceof StewardNotFoundError) {
      return NextResponse.json(
        { error: "NOT_FOUND", message: error.message },
        { status: 404 },
      );
    }
    if (error instanceof StewardUnavailableError) {
      return NextResponse.json(
        { error: "UNAVAILABLE", message: error.message },
        { status: 503 },
      );
    }
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "INVALID_REQUEST",
          message: "Request validation failed",
          issues: error.issues,
        },
        { status: 400 },
      );
    }
    if (error instanceof StewardGatewayError) {
      return NextResponse.json(
        { error: "DECIONIS_GATEWAY_ERROR", message: error.message },
        {
          status:
            error.status >= 400 && error.status < 600 ? error.status : 502,
        },
      );
    }
    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "Steward could not complete the request",
      },
      { status: 500 },
    );
  }
}
