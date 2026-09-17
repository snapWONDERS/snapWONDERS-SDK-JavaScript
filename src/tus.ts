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
 * Hand-rolled TUS 1.0.0 upload — the resumable upload protocol the API uses for file transfer.
 * Two-phase: POST to create, then chunked PATCH. HEAD-resume continues from the current offset so a
 * dropped connection does not restart the whole transfer. The create response Location is absolute.
 */

import { open, stat } from "node:fs/promises";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";

import type { HttpTransport } from "./http.js";
import { TusUploadError } from "./errors.js";

export const TUS_VERSION = "1.0.0";
const DEFAULT_CHUNK = 5 * 1024 * 1024; // 5 MiB

const b64 = (value: string): string => Buffer.from(value, "utf-8").toString("base64");

/** Encode an `Upload-Metadata` header: comma-separated `key <base64(value)>` pairs. */
export function buildMetadata(fields: Record<string, string>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key} ${b64(value)}`)
    .join(",");
}

/** The minimal two-field metadata (kept for tests/back-compat). */
export function encodeMetadata(uploadUid: string, step: number): string {
  return buildMetadata({ upload_uid: uploadUid, step: String(step) });
}

/** Normalise a create `Location` to a base-relative path for subsequent PATCH/HEAD. */
export function toRelative(location: string, baseUrl: string): string {
  if (location.startsWith(baseUrl)) return location.slice(baseUrl.length);
  if (/^https?:\/\//.test(location)) return new URL(location).pathname;
  return location.startsWith("/") ? location : "/" + location;
}

/** Upload one file for `uploadUid` at `step`. Returns the TUS upload path used. */
export async function uploadFile(
  transport: HttpTransport,
  filePath: string,
  uploadUid: string,
  step: number,
  chunkSize: number = DEFAULT_CHUNK,
): Promise<string> {
  let total: number;
  try {
    total = (await stat(filePath)).size;
  } catch {
    throw new TusUploadError(`Not a file: ${filePath}`);
  }

  // Phase 1 — create. Send `name` (original filename → reveal-side recovery) and a stable
  // `client_upload_id` so a retried create does not create a duplicate row (TusController reads both).
  const create = await transport.request("POST", "/api/tus", {
    headers: {
      "Tus-Resumable": TUS_VERSION,
      "Upload-Length": String(total),
      "Upload-Metadata": buildMetadata({
        upload_uid: uploadUid,
        step: String(step),
        name: basename(filePath),
        client_upload_id: randomUUID(),
      }),
    },
    expected: [200, 201],
  });
  const location = create.headers.get("Location");
  if (!location) throw new TusUploadError("TUS create returned no Location header");
  const uploadPath = toRelative(location, transport.baseUrl);

  // Phase 2 — stream from the current server offset (resume-safe).
  let offset = await serverOffset(transport, uploadPath);
  const handle = await open(filePath, "r");
  try {
    while (offset < total) {
      const size = Math.min(chunkSize, total - offset);
      const buf = Buffer.alloc(size);
      const { bytesRead } = await handle.read(buf, 0, size, offset);
      if (bytesRead === 0) break;
      const resp = await transport.request("PATCH", uploadPath, {
        headers: {
          "Tus-Resumable": TUS_VERSION,
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: buf.subarray(0, bytesRead),
        expected: [200, 204],
      });
      const newOffset = resp.headers.get("Upload-Offset");
      offset = newOffset !== null ? Number(newOffset) : offset + bytesRead;
    }
  } finally {
    await handle.close();
  }

  if (offset !== total) {
    throw new TusUploadError(`Upload incomplete: sent to offset ${offset} of ${total}`);
  }
  return uploadPath;
}

async function serverOffset(transport: HttpTransport, uploadPath: string): Promise<number> {
  const resp = await transport.request("HEAD", uploadPath, {
    headers: { "Tus-Resumable": TUS_VERSION },
    expected: [200, 204],
  });
  return Number(resp.headers.get("Upload-Offset") ?? "0");
}
