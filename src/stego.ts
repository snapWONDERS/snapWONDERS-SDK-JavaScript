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
 * Steganography (hide / reveal) — the flagship flow. Wraps session → TUS upload → job → poll →
 * results → download.
 */

import type { HttpTransport } from "./http.js";
import * as base from "./base.js";
import { uploadFile } from "./tus.js";
import { ResultFile } from "./models.js";

const JOB_DOWNLOAD_PREFIX = "/api/job/download";

export interface JobWaitOptions extends base.PollOptions {
  strict?: boolean;
}

export class StegoJob {
  status?: string;
  error?: string;
  progressMessage?: string;

  // Status and results are keyed by the session's uploadUid, not the jobUid. Poll and fetch by
  // uploadUid to match the API contract.
  constructor(
    private readonly t: HttpTransport,
    readonly uploadUid: string,
    readonly jobUid: string,
    readonly jobType: string,
  ) {}

  async wait(opts: JobWaitOptions = {}): Promise<StegoJob> {
    const final = await base.pollJob(this.t, `/api/job/${this.uploadUid}`, opts);
    this.status = final.status as string | undefined;
    this.error = final.error as string | undefined;
    this.progressMessage = final.progress_message as string | undefined;
    base.checkTerminal(final, this.jobUid, opts.strict ?? false);
    return this;
  }

  async results(): Promise<ResultFile[]> {
    const data = (await (await this.t.request("GET", `/api/job/${this.uploadUid}/results`, { expected: [200] })).json()) as Record<string, any>;
    return (data.result_files ?? []).map((f: Record<string, any>) => ResultFile.fromJson(f, this.t, JOB_DOWNLOAD_PREFIX));
  }
}

export class StegoSession {
  constructor(private readonly t: HttpTransport, readonly uploadUid: string, readonly sessionType: string) {}

  /** Upload one file at `step` (1 = secret/stego input, 2 = cover for hide). */
  upload(filePath: string, step: number): Promise<string> {
    return uploadFile(this.t, filePath, this.uploadUid, step);
  }

  async files(): Promise<Record<string, unknown>[]> {
    return base.extractFiles(await (await this.t.request("GET", `/api/session/${this.uploadUid}/files`, { expected: [200] })).json());
  }

  async waitForUploads(opts: base.PollOptions = {}): Promise<StegoSession> {
    await base.waitForUploads(this.t, `/api/session/${this.uploadUid}/files`, opts);
    return this;
  }

  async startJob(options: { password: string; expiry?: string } & Record<string, unknown>): Promise<StegoJob> {
    const { password, expiry = "1d", ...rest } = options;
    const body = { upload_uid: this.uploadUid, password, expiry, ...rest };
    const data = (await (await this.t.request("POST", "/api/job", { json: body, expected: [200, 201] })).json()) as Record<string, any>;
    return new StegoJob(this.t, this.uploadUid, data.job_uid, data.job_type ?? this.sessionType);
  }
}

export class Stego {
  constructor(private readonly t: HttpTransport) {}

  async createSession(sessionType: "hide" | "reveal"): Promise<StegoSession> {
    if (sessionType !== "hide" && sessionType !== "reveal") {
      throw new TypeError("sessionType must be 'hide' or 'reveal'");
    }
    const data = (await (await this.t.request("POST", "/api/session", { json: { type: sessionType }, expected: [200, 201] })).json()) as Record<string, any>;
    return new StegoSession(this.t, data.upload_uid, sessionType);
  }

  /** One-shot: last file is the cover (step 2); earlier files are secrets (step 1). */
  async hide(files: string[], options: { password: string; expiry?: string } & Record<string, unknown>): Promise<StegoJob> {
    if (files.length < 2) throw new TypeError("hide() needs at least one secret and one cover (>=2 files)");
    const session = await this.createSession("hide");
    const cover = files[files.length - 1]!;
    for (const secret of files.slice(0, -1)) await session.upload(secret, 1);
    await session.upload(cover, 2);
    await session.waitForUploads();
    return (await session.startJob(options)).wait();
  }

  async reveal(stegoFile: string, options: { password: string; expiry?: string }): Promise<StegoJob> {
    const session = await this.createSession("reveal");
    await session.upload(stegoFile, 1);
    await session.waitForUploads();
    return (await session.startJob(options)).wait();
  }
}
