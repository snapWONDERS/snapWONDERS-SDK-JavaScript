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
 * Direct upload — the whole file in one request, for anything under the server's size cap.
 *
 * The alternative to `tus.ts`. TUS costs a create, one or more chunked PATCHes and sometimes a
 * HEAD; this is a single POST with the file as the request body. For the common case — one photo,
 * well under the cap — that is one round trip instead of three, which matters most on the
 * high-latency links this API is often used over (Tor and I2P).
 *
 * Callers do not choose between the two. `uploadRouter.uploadFile()` picks, using the
 * `max_upload_bytes` the server reports when the session is created.
 */

import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";

import type { HttpTransport } from "./http.js";
import { UploadError } from "./errors.js";

/**
 * Mirrors the server's own fallback (`upload.direct.max_bytes`). Only used when a session response
 * did not carry `max_upload_bytes` — prefer the server's figure, which can move without an SDK
 * release.
 */
export const DEFAULT_MAX_BYTES = 99_614_720; // 95 MiB

/**
 * Upload one file for `uploadUid` at `step` in a single request.
 *
 * Resolves to the `storage_uid` the server assigned. Throws `UploadError` on failure — the same
 * base `TusUploadError` extends, so callers can treat both upload paths identically.
 */
export async function uploadFile(
  transport: HttpTransport,
  filePath: string,
  uploadUid: string,
  step: number,
  contentType: string = "application/octet-stream",
): Promise<string> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new UploadError(`Not a file: ${filePath}`);
  } catch (e) {
    if (e instanceof UploadError) throw e;
    throw new UploadError(`Cannot read file: ${filePath}`);
  }

  // Read the whole file into memory rather than streaming it.
  //
  // This is deliberate and must not be "optimised" into a stream. undici sets Content-Length for a
  // Uint8Array body, but switches to Transfer-Encoding: chunked for a stream — and the server
  // refuses chunked uploads with 411, because without a declared length a body truncated in
  // transit cannot be told apart from a complete one. Analysing a truncated file would return
  // confident findings about a file the user never sent, which is why that rule exists. Streaming
  // here looks like a clear win in review (less memory!) and silently breaks every upload.
  //
  // The memory cost is bounded by the size check the router already made — this path only runs for
  // files under max_upload_bytes.
  const body = await readFile(filePath);

  const response = await transport.request("POST", "/api/upload", {
    headers: {
      "X-Upload-Uid": uploadUid,
      "X-Upload-Step": String(step),
      "X-Filename": basename(filePath),
      "Content-Type": contentType,
      // Same idempotency contract as the TUS path: a retry after a lost response returns the
      // original result instead of storing the file twice.
      "X-Client-Upload-Id": randomUUID(),
    },
    body: new Uint8Array(body),
    expected: [200, 201],
  });

  const payload = (await response.json()) as { file?: { storage_uid?: string } };
  const storageUid = payload?.file?.storage_uid;
  if (!storageUid) throw new UploadError("Direct upload returned no storage_uid");
  return storageUid;
}
