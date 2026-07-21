/*
 * snapWONDERS API — JavaScript/TypeScript SDK
 * API version: 1.0
 *
 * Copyright (c) 2026 Kenneth Springer @ snapWONDERS. MIT Licensed — see LICENSE.
 * The MIT licence covers this client library only; the snapWONDERS API it calls is proprietary.
 *
 * Author: Kenneth Springer @ snapWONDERS <kenneth@snapwonders.com> (https://kennethbspringer.au)
 *
 * All the snapWONDERS API services are available over the Clearnet / **Web** and Dark Web **Tor** and **I2P**
 * Read details: https://snapwonders.com/developers
 */

/**
 * Typed errors for the snapWONDERS API client. Every failure the SDK raises is one of these, so callers
 * can branch on failure kind rather than inspecting HTTP status codes.
 */

export class SnapwondersError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Missing, malformed, unknown, or revoked API key (HTTP 401/403). */
export class AuthError extends SnapwondersError {}

/** The 24-hour upload session window has passed (HTTP 410). */
export class SessionExpiredError extends SnapwondersError {}

/** A Pro-only option was used on a free account (HTTP 402). */
export class ProRequiredError extends SnapwondersError {}

/** Rate limited (HTTP 429). `retryAfter` is seconds if the server supplied it. */
/**
 * snapWONDERS is temporarily unavailable for maintenance (HTTP 503 + `status: MAINTENANCE`).
 *
 * Distinct from a transient 5xx: the service is *deliberately* down and nothing is wrong with the
 * caller's request. Retrying in a couple of seconds is pointless — the server sends `Retry-After`
 * (300s at the time of writing), surfaced here as `retryAfter` so the caller can wait properly or
 * fail fast, as suits them.
 */
export class MaintenanceError extends SnapwondersError {
  constructor(message: string, readonly retryAfter?: number) {
    super(message);
  }
}

export class RateLimitError extends SnapwondersError {
  retryAfter?: number;
  constructor(message: string, retryAfter?: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

/** A job finished as `failed` (or `partial` when strict). `errorDetail` is the safe server text. */
export class JobFailedError extends SnapwondersError {
  errorDetail?: string;
  status?: string;
  constructor(message: string, opts: { errorDetail?: string; status?: string } = {}) {
    super(message);
    this.errorDetail = opts.errorDetail;
    this.status = opts.status;
  }
}

/** A TUS create/PATCH/resume step failed. */
export class TusUploadError extends SnapwondersError {}

/** A transport-level failure (connection refused, DNS, timeout) after retries were exhausted. */
export class NetworkError extends SnapwondersError {}

/** Any other non-2xx API response. */
export class ApiError extends SnapwondersError {
  statusCode: number;
  body: unknown;
  constructor(message: string, statusCode: number, body: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.body = body;
  }
}
