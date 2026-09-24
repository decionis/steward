export class StewardUnauthorizedError extends Error {
  constructor(message = "A Decionis session is required") {
    super(message);
    this.name = "StewardUnauthorizedError";
  }
}

export class StewardForbiddenError extends Error {
  constructor(message = "The current role cannot perform this action") {
    super(message);
    this.name = "StewardForbiddenError";
  }
}

export class StewardGatewayError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "StewardGatewayError";
    this.status = status;
    this.body = body;
  }
}

export class StewardNotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} was not found`);
    this.name = "StewardNotFoundError";
  }
}

/**
 * Something this tier depends on is not available yet: a Protocol operation
 * the platform has not published, or a signal source that is not configured.
 * Maps to 503, and the message says which.
 */
export class StewardUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StewardUnavailableError";
  }
}
