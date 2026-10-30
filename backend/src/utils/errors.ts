export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validationError(message: string, details?: unknown) {
  return new AppError(400, message, "validation_error", details);
}

export function unauthorized(message = "Unauthorized") {
  return new AppError(401, message, "unauthorized");
}

export function forbidden(message = "Forbidden") {
  return new AppError(403, message, "forbidden");
}

export function notFound(message = "Not found") {
  return new AppError(404, message, "not_found");
}

export function conflict(message: string, details?: unknown) {
  return new AppError(409, message, "conflict", details);
}

export function rateLimited(message = "Rate limit exceeded") {
  return new AppError(429, message, "rate_limited");
}

/** The company hasn't connected a CRM (each company connects its own in Settings). */
export function crmNotConnected() {
  return new AppError(
    503,
    "No CRM is connected. A tenant admin can connect one in Settings → Connections & usage.",
    "crm_not_connected",
  );
}

export function providerNotConfigured(provider = "exa", envVar = "EXA_API_KEY") {
  return new AppError(
    503,
    `${provider} provider is not configured. Set ${envVar} in backend/.env`,
    "provider_not_configured",
  );
}

/** Upstream provider failure, kept distinct from validation/authorization errors (spec §8). */
export function providerError(message: string, code = "provider_error") {
  return new AppError(502, message, code);
}
