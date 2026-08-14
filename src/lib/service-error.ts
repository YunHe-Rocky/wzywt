export type ServiceErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "BUSINESS_VALIDATION_FAILED"
  | "TOO_MANY_REQUESTS"
  | "REQUEST_TIMEOUT"
  | "SERVICE_UNAVAILABLE";

const STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  BUSINESS_VALIDATION_FAILED: 422,
  TOO_MANY_REQUESTS: 429,
  REQUEST_TIMEOUT: 408,
  SERVICE_UNAVAILABLE: 503,
};

export class ServiceError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
    this.status = STATUS_BY_CODE[code];
  }
}
