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
 * @snapwonders/sdk — official JS/TS client for the snapWONDERS API.
 *
 * Steganography, forensic media analysis, and format conversion, wrapping the resumable upload and
 * the session → job → poll → download flow into a couple of awaits.
 */

export { Client } from "./client.js";
export type { ClientOptions } from "./client.js";
export { Stego, StegoSession, StegoJob } from "./stego.js";
export { Analyse, AnalyseSession, AnalyseJob } from "./analyse.js";
export { Convert, ConvertSession, ConvertJob } from "./convert.js";
export { ResultFile, AnalyseItem } from "./models.js";
export {
  SnapwondersError,
  AuthError,
  SessionExpiredError,
  ProRequiredError,
  MaintenanceError,
  RateLimitError,
  JobFailedError,
  TusUploadError,
  NetworkError,
  ApiError,
} from "./errors.js";

export const VERSION = "0.0.1-dev.0";
