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
 * Low-level HTTP transport: auth header, retry-on-5xx, and error mapping. The single place the SDK
 * talks to the network. Uses the global `fetch` (Node >= 18, all modern browsers) — zero runtime deps.
 *
 * Maps API error responses to typed exceptions.
 */

import {
  ApiError,
  AuthError,
  NetworkError,
  ProRequiredError,
  MaintenanceError,
  RateLimitError,
  SessionExpiredError,
} from "./errors.js";

export const DEFAULT_BASE_URL = "https://snapwonders.com";
const RETRY_STATUSES = new Set([500, 502, 503, 504]);
const MAX_RETRIES = 2; // retries after the first try — 3 attempts total
const BACKOFF_CAP_MS = 30_000;

export interface RequestOptions {
  json?: unknown;
  headers?: Record<string, string>;
  body?: Uint8Array | string;
  expected?: number[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class HttpTransport {
  readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(apiKey?: string, baseUrl: string = DEFAULT_BASE_URL, timeoutMs = 30_000) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  async request(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
    const expected = opts.expected ?? [200, 201];
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (this.apiKey) headers["X-Api-Key"] = this.apiKey;

    let body = opts.body;
    if (opts.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.json);
    }

    let attempt = 0;
    while (true) {
      attempt += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      try {
        response = await fetch(this.baseUrl + path, { method, headers, body, signal: controller.signal });
      } catch (err) {
        // fetch rejects on network failure / timeout (AbortError) — retry, then surface as a typed
        // error so a raw fetch rejection never escapes the SDK's own exception hierarchy.
        if (attempt <= MAX_RETRIES) {
          await sleep(Math.min(BACKOFF_CAP_MS, 2 ** (attempt - 1) * 1000));
          continue;
        }
        throw new NetworkError(`Network error contacting ${this.baseUrl}: ${(err as Error).name}`);
      } finally {
        clearTimeout(timer);
      }
      // A maintenance 503 is deliberate, not transient — the server asks for ~300s. Burning the
      // retry budget over a few seconds cannot help, so surface it immediately and let the caller
      // decide whether to wait out the window.
      if (
        RETRY_STATUSES.has(response.status) &&
        attempt <= MAX_RETRIES &&
        !(await isMaintenance(response))
      ) {
        await sleep(Math.min(BACKOFF_CAP_MS, 2 ** (attempt - 1) * 1000));
        continue;
      }
      if (!expected.includes(response.status)) {
        await raiseForResponse(response);
      }
      return response;
    }
  }
}

/**
 * True for the maintenance 503. The API returns `{"status":"MAINTENANCE", ...}` with a
 * `Retry-After` header and no `message`/`error` key, so it needs its own check rather than falling
 * through to `extractMessage`.
 *
 * Reads a `clone()` so the caller's `response.text()` still has an unconsumed body to work with.
 */
async function isMaintenance(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const body = (await response.clone().json()) as Record<string, unknown> | null;
    return !!body && body.status === "MAINTENANCE";
  } catch {
    return false; // HTML or empty body
  }
}

export async function raiseForResponse(response: Response): Promise<never> {
  let body: unknown;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : "";
  } catch {
    body = text;
  }
  const message = extractMessage(body) ?? `HTTP ${response.status}`;

  if (
    response.status === 503 &&
    body &&
    typeof body === "object" &&
    (body as Record<string, unknown>).status === "MAINTENANCE"
  ) {
    const ra = response.headers.get("Retry-After");
    throw new MaintenanceError(
      "snapWONDERS is temporarily unavailable for maintenance." +
        (ra ? ` Retry after ${ra}s.` : " Try again shortly.") +
        " Your request was not processed and nothing is wrong with it.",
      ra ? Number(ra) : undefined,
    );
  }

  switch (response.status) {
    case 401:
    case 403:
      throw new AuthError(message);
    case 402:
      throw new ProRequiredError(message);
    case 410:
      throw new SessionExpiredError(message);
    case 429: {
      const ra = response.headers.get("Retry-After");
      throw new RateLimitError(message, ra ? Number(ra) : undefined);
    }
    default:
      throw new ApiError(message, response.status, body);
  }
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.message === "string") return b.message;
    if (typeof b.error === "string") return b.error;
  }
  if (typeof body === "string" && body) return body;
  return undefined;
}
