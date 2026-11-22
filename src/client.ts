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
 * Top-level Client — the single entry point.
 *
 *   import { Client } from "@snapwonders/sdk";
 *   const client = new Client("sw_...");
 *   await client.status();
 *   const job = await client.stego.hide(["secret.pdf", "cover.jpg"], { password: "Str0ng!Pass" });
 *
 * Covers hide, reveal, analyse and convert.
 */

import { DEFAULT_BASE_URL, HttpTransport } from "./http.js";
import { Stego } from "./stego.js";
import { Analyse } from "./analyse.js";
import { Convert } from "./convert.js";

export interface ClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export class Client {
  readonly stego: Stego;
  readonly analyse: Analyse;
  readonly convert: Convert;
  private readonly transport: HttpTransport;

  constructor(apiKey?: string, opts: ClientOptions = {}) {
    this.transport = new HttpTransport(apiKey, opts.baseUrl ?? DEFAULT_BASE_URL, opts.timeoutMs ?? 30_000);
    this.stego = new Stego(this.transport);
    this.analyse = new Analyse(this.transport);
    this.convert = new Convert(this.transport);
  }

  /** GET /api/status — no API key required. The one-liner that rescues the first-call leak. */
  async status(): Promise<Record<string, unknown>> {
    const resp = await this.transport.request("GET", "/api/status", { expected: [200, 503] });
    return (await resp.json()) as Record<string, unknown>;
  }
}
