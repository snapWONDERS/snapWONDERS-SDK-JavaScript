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
 * Forensic analysis surface. session → TUS upload (all files step 1) → job → poll →
 * /analyse/result/{jobUid} (per-file grades + downloadable assets).
 * Result container keys are read defensively — their exact names can vary per product area.
 */

import type { HttpTransport } from "./http.js";
import * as base from "./base.js";
import { uploadFile } from "./tus.js";
import { AnalyseItem } from "./models.js";

export function extractItems(payload: any): Record<string, any>[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    for (const key of ["files", "items", "results"]) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  return [];
}

export interface JobWaitOptions extends base.PollOptions {
  strict?: boolean;
}

export class AnalyseJob {
  status?: string;
  error?: string;

  // The status endpoint is keyed by the session's uploadUid; only /result/{jobUid} is keyed by
  // jobUid. These two IDs differ, so status is polled by uploadUid.
  constructor(private readonly t: HttpTransport, readonly uploadUid: string, readonly jobUid: string) {}

  async wait(opts: JobWaitOptions = {}): Promise<AnalyseJob> {
    const final = await base.pollJob(this.t, `/api/analyse/job/${this.uploadUid}`, opts);
    this.status = final.status as string | undefined;
    this.error = final.error as string | undefined;
    base.checkTerminal(final, this.jobUid, opts.strict ?? false);
    return this;
  }

  /** Per-file forensic verdicts + downloadable assets. */
  async results(): Promise<AnalyseItem[]> {
    const data = await (await this.t.request("GET", `/api/analyse/result/${this.jobUid}`, { expected: [200] })).json();
    return extractItems(data).map((item) => AnalyseItem.fromJson(item, this.t));
  }
}

export class AnalyseSession {
  constructor(private readonly t: HttpTransport, readonly uploadUid: string) {}

  upload(filePath: string): Promise<string> {
    return uploadFile(this.t, filePath, this.uploadUid, 1);
  }

  async files(): Promise<Record<string, unknown>[]> {
    return base.extractFiles(await (await this.t.request("GET", `/api/analyse/session/${this.uploadUid}/files`, { expected: [200] })).json());
  }

  async waitForUploads(opts: base.PollOptions = {}): Promise<AnalyseSession> {
    await base.waitForUploads(this.t, `/api/analyse/session/${this.uploadUid}/files`, opts);
    return this;
  }

  /** options = face_detection, text_detection, face_sensitivity, forensic_depth. */
  async startJob(options: { expiry?: string } & Record<string, unknown> = {}): Promise<AnalyseJob> {
    const { expiry = "1d", ...rest } = options;
    const body = { upload_uid: this.uploadUid, expiry, ...rest };
    const data = (await (await this.t.request("POST", "/api/analyse/job", { json: body, expected: [200, 201] })).json()) as Record<string, any>;
    return new AnalyseJob(this.t, this.uploadUid, data.job_uid);
  }
}

export class Analyse {
  constructor(private readonly t: HttpTransport) {}

  async createSession(): Promise<AnalyseSession> {
    const data = (await (await this.t.request("POST", "/api/analyse/session", { json: {}, expected: [200, 201] })).json()) as Record<string, any>;
    return new AnalyseSession(this.t, data.upload_uid);
  }

  async run(files: string[], options: { expiry?: string } & Record<string, unknown> = {}): Promise<AnalyseJob> {
    if (files.length === 0) throw new TypeError("run() needs at least one file to analyse");
    const session = await this.createSession();
    for (const f of files) await session.upload(f);
    await session.waitForUploads();
    return (await session.startJob(options)).wait();
  }
}
