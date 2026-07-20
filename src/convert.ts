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
 * Media conversion surface. session → TUS upload (all files step 1) → job → poll →
 * /convert/job/{uid}/results → /convert/download/{assetId}.
 * Options pass through untyped (the API validates them); the image format key is `image_format`.
 */

import type { HttpTransport } from "./http.js";
import * as base from "./base.js";
import { uploadFile } from "./tus.js";
import { ResultFile } from "./models.js";

const CONVERT_DOWNLOAD_PREFIX = "/api/convert/download";

export interface JobWaitOptions extends base.PollOptions {
  strict?: boolean;
}

export class ConvertJob {
  status?: string;
  error?: string;

  // Both status and results are keyed by the session's uploadUid, not the jobUid (which differs
  // for convert). Poll and fetch by uploadUid to match the API contract.
  constructor(private readonly t: HttpTransport, readonly uploadUid: string, readonly jobUid: string) {}

  async wait(opts: JobWaitOptions = {}): Promise<ConvertJob> {
    const final = await base.pollJob(this.t, `/api/convert/job/${this.uploadUid}`, opts);
    this.status = final.status as string | undefined;
    this.error = final.error as string | undefined;
    base.checkTerminal(final, this.jobUid, opts.strict ?? false);
    return this;
  }

  async results(): Promise<ResultFile[]> {
    const data = (await (await this.t.request("GET", `/api/convert/job/${this.uploadUid}/results`, { expected: [200] })).json()) as Record<string, any>;
    // The API returns `result_files`; `items` is kept as a fallback.
    const items = data.result_files ?? data.items ?? [];
    return items
      .filter((item: Record<string, any>) => item.asset_id)
      .map((item: Record<string, any>) => ResultFile.fromJson(item, this.t, CONVERT_DOWNLOAD_PREFIX));
  }
}

export class ConvertSession {
  constructor(private readonly t: HttpTransport, readonly uploadUid: string) {}

  upload(filePath: string): Promise<string> {
    return uploadFile(this.t, filePath, this.uploadUid, 1);
  }

  async files(): Promise<Record<string, unknown>[]> {
    return base.extractFiles(await (await this.t.request("GET", `/api/convert/session/${this.uploadUid}/files`, { expected: [200] })).json());
  }

  async waitForUploads(opts: base.PollOptions = {}): Promise<ConvertSession> {
    await base.waitForUploads(this.t, `/api/convert/session/${this.uploadUid}/files`, opts);
    return this;
  }

  async startJob(options: { expiry?: string } & Record<string, unknown> = {}): Promise<ConvertJob> {
    const { expiry = "1d", ...rest } = options;
    const body = { upload_uid: this.uploadUid, expiry, ...rest };
    const data = (await (await this.t.request("POST", "/api/convert/job", { json: body, expected: [200, 201] })).json()) as Record<string, any>;
    return new ConvertJob(this.t, this.uploadUid, data.job_uid);
  }
}

export class Convert {
  constructor(private readonly t: HttpTransport) {}

  async createSession(): Promise<ConvertSession> {
    const data = (await (await this.t.request("POST", "/api/convert/session", { json: {}, expected: [200, 201] })).json()) as Record<string, any>;
    return new ConvertSession(this.t, data.upload_uid);
  }

  async run(files: string[], options: { expiry?: string } & Record<string, unknown> = {}): Promise<ConvertJob> {
    if (files.length === 0) throw new TypeError("run() needs at least one file to convert");
    const session = await this.createSession();
    for (const f of files) await session.upload(f);
    await session.waitForUploads();
    return (await session.startJob(options)).wait();
  }
}
