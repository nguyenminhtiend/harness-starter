export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(`${resource} '${id}' not found`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

export class InvalidRunStateError extends AppError {
  constructor(currentStatus: string, attemptedTransition: string) {
    super(
      `Cannot transition from '${currentStatus}' via '${attemptedTransition}'`,
      'INVALID_RUN_STATE',
      409,
    );
  }
}

export class CapabilityExecutionError extends AppError {
  override readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message, 'CAPABILITY_EXECUTION_ERROR', 500);
    this.cause = cause;
  }
}

export class ExternalServiceError extends AppError {
  readonly service: string;

  constructor(service: string, message: string) {
    super(message, 'EXTERNAL_SERVICE_ERROR', 502);
    this.service = service;
  }
}
