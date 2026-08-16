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
 * Chooses the upload method, so nothing above this layer has to know there are two.
 *
 * The API offers a single-request direct upload for files under a server-declared cap, and the
 * resumable TUS protocol for everything else. Which one is right is a mechanical decision — file
 * size against `max_upload_bytes` — and not something a caller of this SDK should ever have to
 * think about, so it is made here and only here.
 */

import { stat } from "node:fs/promises";

import type { HttpTransport } from "./http.js";
import * as direct from "./direct.js";
import * as tus from "./tus.js";
import { UploadError } from "./errors.js";

/**
 * Upload one file by whichever method fits, and resolve to an identifier for it.
 *
 * `maxUploadBytes` should be the value the session-create response reported. Passing it means the
 * cap can change server-side without an SDK release; omitting it falls back to the figure this SDK
 * was built against.
 *
 * ⚠️ **The resolved string means different things by method.** Direct upload returns the server's
 * `storage_uid`; TUS returns the upload URL it used. That difference predates this router — it is
 * what each underlying function has always returned — but before direct upload existed,
 * `session.upload()` always returned the TUS URL, so anyone relying on that value for a small file
 * now gets a `storage_uid` instead.
 *
 * Neither value is needed for the normal flow: uploads are confirmed with `session.files()` /
 * `waitForUploads()` and jobs are keyed by `uploadUid`. The return is a diagnostic aid, and is
 * documented rather than unified because normalising it would mean either discarding information
 * or changing what `tus.uploadFile()` returns, and that function is deliberately untouched.
 */
export async function uploadFile(
  transport: HttpTransport,
  filePath: string,
  uploadUid: string,
  step: number,
  maxUploadBytes?: number,
): Promise<string> {
  const limit = maxUploadBytes ?? direct.DEFAULT_MAX_BYTES;

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    throw new UploadError(`Cannot read file: ${filePath}`);
  }

  if (size <= limit) {
    return direct.uploadFile(transport, filePath, uploadUid, step);
  }

  // Over the cap, or the caller wants resume behaviour: the protocol earns its cost here.
  return tus.uploadFile(transport, filePath, uploadUid, step);
}
