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
 * Shared job/upload polling primitives used by every product namespace. The polling loops live in
 * exactly one place (the bug-prone part), while each namespace keeps explicit session/job classes.
 */

import type { HttpTransport } from "./http.js";
import { JobFailedError, SnapwondersError } from "./errors.js";

export const TERMINAL_STATES = new Set(["completed", "partial", "failed"]);

export interface PollOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Polling cadence. Fixed-interval polling is a scaling hazard: N clients that start together poll in
// lockstep, so the server sees a synchronised burst (a thundering herd). We back off (fast first
// checks catch quick jobs; long jobs poll progressively less) and jitter each wait so concurrent
// clients desynchronise. The server can override the cadence centrally by returning
// `retry_after`/`poll_after` (seconds) in the status body — the SDK obeys it.
const POLL_BACKOFF = 1.6;
const POLL_MAX_INTERVAL_MS = 15_000;
const POLL_JITTER = 0.25;

/** Returns `[sleepMs, nextBaseMs]` for one poll cycle (server hint wins, else backoff + jitter). */
function nextWaitMs(currentMs: number, statusBody: Record<string, unknown>): [number, number] {
  const hint = statusBody.retry_after ?? statusBody.poll_after;
  const hintSec = typeof hint === "number" ? hint : typeof hint === "string" ? Number(hint) : NaN;
  if (Number.isFinite(hintSec)) {
    const base = hintSec * 1000;
    return [base, base]; // honour the server; don't keep growing while it dictates
  }
  const sleepMs = currentMs * (1 - POLL_JITTER + Math.random() * 2 * POLL_JITTER);
  return [sleepMs, Math.min(currentMs * POLL_BACKOFF, POLL_MAX_INTERVAL_MS)];
}

/** Normalise a `session/{uid}/files` response to an array of file objects. */
export function extractFiles(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const files = (payload as Record<string, unknown>).files;
    if (Array.isArray(files)) return files as Record<string, unknown>[];
  }
  return [];
}

/** Poll `filesPath` until every uploaded file reports `completed`. */
export async function waitForUploads(
  transport: HttpTransport,
  filesPath: string,
  { pollIntervalMs = 1000, timeoutMs = 120_000 }: PollOptions = {},
): Promise<Record<string, unknown>[]> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const files = extractFiles(await (await transport.request("GET", filesPath, { expected: [200] })).json());
    if (files.length > 0 && files.every((f) => f.status === "completed")) return files;
    if (Date.now() > deadline) throw new SnapwondersError(`Uploads at ${filesPath} not complete within ${timeoutMs}ms`);
    await sleep(pollIntervalMs);
  }
}

/** Poll `statusPath` until the job reaches a terminal state; return the final status body. */
export async function pollJob(
  transport: HttpTransport,
  statusPath: string,
  { pollIntervalMs = 1500, timeoutMs = 900_000 }: PollOptions = {},
): Promise<Record<string, unknown>> {
  // pollIntervalMs is the INITIAL gap; it backs off (× ~1.6, capped 15s) with jitter so many
  // concurrent clients don't hammer the API in lockstep. A server retry_after/poll_after overrides.
  const deadline = Date.now() + timeoutMs;
  let interval = pollIntervalMs;
  while (true) {
    const data = (await (await transport.request("GET", statusPath, { expected: [200] })).json()) as Record<string, unknown>;
    if (typeof data.status === "string" && TERMINAL_STATES.has(data.status)) return data;
    if (Date.now() > deadline) throw new SnapwondersError(`Job at ${statusPath} did not finish within ${timeoutMs}ms`);
    const [sleepMs, next] = nextWaitMs(interval, data);
    interval = next;
    await sleep(Math.min(sleepMs, Math.max(0, deadline - Date.now())));
  }
}

/** Exposed for tests: the per-cycle wait calculation (server hint vs backoff+jitter). */
export const _nextWaitMs = nextWaitMs;

/** Throw JobFailedError on `failed` (and on `partial` when strict). */
/**
 * Throw `JobFailedError` on `failed` (and on `partial` when `strict`).
 *
 * The human-readable reason lives in `progress_message`, **not** `error` (which may be null).
 * Prefer `error` (the sanitised field when the API sets it) and fall back to `progress_message`.
 */
export function checkTerminal(statusBody: Record<string, unknown>, uid: string, strict: boolean): void {
  const status = statusBody.status as string | undefined;
  if (status === "failed" || (strict && status === "partial")) {
    const reason =
      (statusBody.error as string | undefined) || (statusBody.progress_message as string | undefined);
    throw new JobFailedError(`Job ${uid} ended as ${status}${reason ? `: ${reason}` : ""}`, {
      errorDetail: reason,
      status,
    });
  }
}
