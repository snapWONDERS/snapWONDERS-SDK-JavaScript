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
 * Result value objects returned to callers — thin views over the API JSON with a `download` helper.
 * Field parsing is lenient — the exact result JSON keys can differ per product area.
 */

import { writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { HttpTransport } from "./http.js";

export class ResultFile {
  constructor(
    readonly assetId: string,
    readonly name: string,
    readonly mimeType: string | undefined,
    readonly fileSize: number | undefined,
    private readonly transport: HttpTransport,
    private readonly downloadPath: string,
  ) {}

  /**
   * Stream this asset to `dest` and return the written path.
   *
   * `dest` may be a file path (`"out/photo.avif"`) or a directory (`"out/"`, or `"out"` when it
   * already exists), in which case the server-supplied `name` is appended.
   *
   * A **trailing separator means "directory"** even when it does not exist yet — `stat()` throws for
   * a path yet to be created, so relying on it alone silently wrote the asset to a *file* named
   * `out` — a trailing separator must be honoured explicitly, or the asset is written to a file
   * literally named e.g. `out`.
   */
  async download(dest: string): Promise<string> {
    let target = dest;
    if (/[/\\]$/.test(dest)) {
      target = join(dest, this.name);
    } else {
      try {
        if ((await stat(dest)).isDirectory()) target = join(dest, this.name);
      } catch {
        /* dest does not exist and is not marked as a directory — treat as a file path */
      }
    }
    await mkdir(dirname(target), { recursive: true });
    const resp = await this.transport.request("GET", this.downloadPath, { expected: [200] });
    const buf = Buffer.from(await resp.arrayBuffer());
    await writeFile(target, buf);
    return target;
  }

  static fromJson(data: Record<string, any>, transport: HttpTransport, downloadPrefix: string): ResultFile {
    const assetId = data.asset_id as string;
    // Convert results put the converted filename in `output_name` (original in `name`) — prefer it.
    const name = (data.output_name ?? data.name ?? data.filename ?? assetId) as string;
    return new ResultFile(
      assetId,
      name,
      data.mime_type,
      data.file_size ?? data.size_bytes,
      transport,
      `${downloadPrefix}/${assetId}`,
    );
  }
}

/** Forensic verdict for one analysed file, plus downloadable overlay assets. */
export class AnalyseItem {
  constructor(
    readonly filename: string | undefined,
    readonly grade: string | undefined,
    readonly faceCount: number | undefined,
    readonly textRegionCount: number | undefined,
    readonly watermarkFlagged: boolean | undefined,
    readonly steganographySuspected: boolean | undefined,
    /**
     * Forensic verdicts, when the API includes them: `ai_generation` (AI-generation verdict),
     * `c2pa` (Content Credentials), `camera_fingerprint` (device match), `findings` (key findings).
     * A plain object — the exact keys grow over time; read what you need.
     */
    readonly verdicts: Record<string, unknown>,
    readonly assets: ResultFile[],
    readonly raw: Record<string, unknown>,
  ) {}

  static fromJson(data: Record<string, any>, transport: HttpTransport): AnalyseItem {
    // Analyse assets are keyed by `category` (e.g. "ela_map") — not name/type — plus mime/size.
    const assets = (data.assets ?? [])
      .filter((a: Record<string, any>) => a.asset_id)
      .map((a: Record<string, any>) =>
        ResultFile.fromJson(
          { ...a, name: a.name ?? a.category ?? a.type ?? a.asset_id },
          transport,
          "/api/analyse/asset",
        ),
      );
    return new AnalyseItem(
      data.filename ?? data.name,
      data.overall_grade ?? data.grade,
      data.face_count,
      data.text_region_count,
      data.watermark_flagged,
      data.steganography_suspected,
      data.verdicts ?? {},
      assets,
      data,
    );
  }
}
