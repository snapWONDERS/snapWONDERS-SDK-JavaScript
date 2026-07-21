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

/** Offline smoke tests — pure logic, no network or key. Run: `npm test`. */

import { test } from "node:test";
import assert from "node:assert/strict";

import { Client, VERSION, JobFailedError, MaintenanceError } from "../src/index.js";
import { HttpTransport } from "../src/http.js";
import { encodeMetadata, buildMetadata, toRelative } from "../src/tus.js";
import { extractFiles, checkTerminal, TERMINAL_STATES } from "../src/base.js";
import { extractItems } from "../src/analyse.js";
import { ResultFile, AnalyseItem } from "../src/models.js";

test("version present", () => {
  assert.ok(VERSION.startsWith("0."));
});

test("encodeMetadata shape", () => {
  const meta = encodeMetadata("550e8400-uid", 2);
  const [uidPart, stepPart] = meta.split(",");
  assert.equal(uidPart.split(" ")[0], "upload_uid");
  assert.equal(Buffer.from(uidPart.split(" ")[1], "base64").toString(), "550e8400-uid");
  assert.equal(stepPart.split(" ")[0], "step");
  assert.equal(Buffer.from(stepPart.split(" ")[1], "base64").toString(), "2");
});

test("toRelative variants", () => {
  assert.equal(toRelative("https://snapwonders.com/api/tus/x", "https://snapwonders.com"), "/api/tus/x");
  assert.equal(toRelative("/api/tus/x", "https://snapwonders.com"), "/api/tus/x");
  assert.equal(toRelative("api/tus/x", "https://snapwonders.com"), "/api/tus/x");
  assert.equal(toRelative("https://other.host/api/tus/x", "https://snapwonders.com"), "/api/tus/x");
});

test("extractFiles + extractItems", () => {
  assert.deepEqual(extractFiles({ files: [{ status: "completed" }] }), [{ status: "completed" }]);
  assert.deepEqual(extractFiles([{ status: "x" }]), [{ status: "x" }]);
  assert.deepEqual(extractFiles("junk"), []);
  assert.deepEqual(extractItems({ items: [{ grade: "B" }] }), [{ grade: "B" }]);
  assert.deepEqual(extractItems([{ grade: "C" }]), [{ grade: "C" }]);
  assert.deepEqual(extractItems({ nope: 1 }), []);
});

test("checkTerminal raises appropriately", () => {
  assert.doesNotThrow(() => checkTerminal({ status: "completed" }, "j", true));
  assert.doesNotThrow(() => checkTerminal({ status: "partial" }, "j", false));
  assert.throws(() => checkTerminal({ status: "failed", error: "boom" }, "j", false), JobFailedError);
  assert.throws(() => checkTerminal({ status: "partial" }, "j", true), JobFailedError);
  assert.ok(TERMINAL_STATES.has("completed"));
});

test("model lenient parsing", () => {
  const fake = {} as any;
  const rf = ResultFile.fromJson({ asset_id: "a1", filename: "out.webp", size_bytes: 9 }, fake, "/api/convert/download");
  assert.equal(rf.name, "out.webp");
  assert.equal(rf.fileSize, 9);
  const ai = AnalyseItem.fromJson({ filename: "p.jpg", overall_grade: "B", face_count: 2, assets: [{ asset_id: "x1", type: "ela" }] }, fake);
  assert.equal(ai.grade, "B");
  assert.equal(ai.assets.length, 1);
});

test("convert result prefers output_name", () => {
  const rf = ResultFile.fromJson({ asset_id: "a1", name: "photo.jpg", output_name: "photo.webp", size_bytes: 12 }, {} as any, "/api/convert/download");
  assert.equal(rf.name, "photo.webp");
  assert.equal(rf.fileSize, 12);
});

test("analyse asset uses category + passes mime/size through", () => {
  const ai = AnalyseItem.fromJson(
    { name: "p.jpg", grade: "B", assets: [{ asset_id: "x1", category: "ela_map", mime_type: "image/png", file_size: 5 }] },
    {} as any,
  );
  const a = ai.assets[0];
  assert.equal(a.name, "ela_map");
  assert.equal(a.mimeType, "image/png");
  assert.equal(a.fileSize, 5);
});

test("buildMetadata includes all fields", () => {
  const meta = buildMetadata({ upload_uid: "u", step: "1", name: "a.jpg", client_upload_id: "cid" });
  const pairs = Object.fromEntries(meta.split(",").map((p) => p.split(" ")));
  assert.deepEqual(Object.keys(pairs).sort(), ["client_upload_id", "name", "step", "upload_uid"]);
  assert.equal(Buffer.from(pairs.name, "base64").toString(), "a.jpg");
  assert.equal(Buffer.from(pairs.client_upload_id, "base64").toString(), "cid");
});

test("client namespaces + async guards", async () => {
  const client = new Client("sw_test");
  assert.ok(client.stego && client.analyse && client.convert);
  await assert.rejects(() => client.stego.hide(["one.jpg"], { password: "x" }), TypeError);
  await assert.rejects(() => client.analyse.run([]), TypeError);
  await assert.rejects(() => client.convert.run([]), TypeError);
  await assert.rejects(() => client.stego.createSession("nope" as any), TypeError);
});

test("maintenance 503 is typed and not retried", async () => {
  // The API's maintenance response: a 503 with `status: MAINTENANCE`, a `Retry-After` header, and
  // no `message`/`error` key — which is why it needs its own handling.
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        status: "MAINTENANCE",
        service: "vaultify",
        version: "1.0.0",
        timestamp: "2026-01-01T00:00:00+00:00",
      }),
      { status: 503, headers: { "Retry-After": "300", "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const transport = new HttpTransport("sw_x", "https://snapwonders.com");
    const started = Date.now();
    await assert.rejects(
      () => transport.request("POST", "/api/session", { json: { type: "hide" } }),
      (err: unknown) => {
        assert.ok(err instanceof MaintenanceError, `expected MaintenanceError, got ${(err as Error).name}`);
        assert.equal((err as MaintenanceError).retryAfter, 300);
        assert.match((err as Error).message, /maintenance/i);
        return true;
      },
    );
    // Deliberate downtime is not transient: it must not burn the retry budget.
    assert.equal(calls, 1, `expected no retries for maintenance, got ${calls} attempts`);
    assert.ok(Date.now() - started < 1000);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("failed job surfaces the progress_message reason", () => {
  // The failure reason is in `progress_message`; `error` is null. Reading only `error` would hide it.
  const body = {
    job_uid: "0f8eee95-f259-4c55-b658-50b5b3b6d4b9",
    status: "failed",
    progress_message: "This job requires a Pro account.",
    error: null,
  };
  assert.throws(
    () => checkTerminal(body, "0f8eee95", false),
    (err: unknown) => {
      assert.ok(err instanceof JobFailedError);
      assert.match((err as Error).message, /Pro account/);
      assert.equal((err as JobFailedError).errorDetail, "This job requires a Pro account.");
      return true;
    },
  );
});

test("failed job prefers the sanitised error field when set", () => {
  assert.throws(
    () => checkTerminal({ status: "failed", error: "sanitised detail", progress_message: "generic" }, "x", false),
    (err: unknown) => {
      assert.equal((err as JobFailedError).errorDetail, "sanitised detail");
      return true;
    },
  );
});

test("download('out/') creates a directory, not a file named out", async () => {
  // stat() throws for a directory that does not exist yet, so a trailing separator must be
  // honoured explicitly or the asset is written to a file literally named `out`.
  const { mkdtemp, stat: fsStat, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join: pjoin } = await import("node:path");

  const tmp = await mkdtemp(pjoin(tmpdir(), "sw-sdk-"));
  const dest = pjoin(tmp, "out");

  const fakeTransport = {
    request: async () => new Response(new Uint8Array([1, 2, 3, 4])),
  } as unknown as ConstructorParameters<typeof ResultFile>[4];

  const rf = new ResultFile("abc123", "cover-share.avif", "image/avif", 4, fakeTransport, "/api/job/download/abc123");

  const written = await rf.download(dest + "/");

  assert.ok((await fsStat(dest)).isDirectory(), "'out/' must become a directory, not a file");
  assert.equal(written, pjoin(dest, "cover-share.avif"));
  assert.equal((await readFile(written)).length, 4);
});

// UID routing — status must be polled by uploadUid, the id the API keys job status/results on.
// These lock the correct routing per namespace.
class RecordingTransport {
  paths: string[] = [];
  constructor(private statusBody: any = { status: "completed" }, private resultBody: any = { result_files: [], files: [] }) {}
  async request(_method: string, path: string): Promise<any> {
    this.paths.push(path);
    const body = path.endsWith("/results") || path.includes("/result/") ? this.resultBody : this.statusBody;
    return { json: async () => body };
  }
}

test("stego polls status by uploadUid, never jobUid", async () => {
  const { StegoJob } = await import("../src/stego.js");
  const t = new RecordingTransport();
  const job = new StegoJob(t as any, "UPLOAD-111", "JOB-999", "hide");
  await job.wait({ pollIntervalMs: 0 });
  await job.results();
  assert.ok(t.paths.some((p) => p.includes("/api/job/UPLOAD-111")), JSON.stringify(t.paths));
  assert.ok(!t.paths.some((p) => p.includes("JOB-999")), `jobUid leaked: ${JSON.stringify(t.paths)}`);
});

test("analyse polls status by uploadUid but results by jobUid", async () => {
  const { AnalyseJob } = await import("../src/analyse.js");
  const t = new RecordingTransport({ status: "completed" }, { files: [] });
  const job = new AnalyseJob(t as any, "UPLOAD-222", "JOB-888");
  await job.wait({ pollIntervalMs: 0 });
  await job.results();
  assert.ok(t.paths.includes("/api/analyse/job/UPLOAD-222"), JSON.stringify(t.paths));
  assert.ok(t.paths.includes("/api/analyse/result/JOB-888"), JSON.stringify(t.paths));
  assert.ok(!t.paths.includes("/api/analyse/job/JOB-888"), JSON.stringify(t.paths));
});

test("convert polls and fetches results by uploadUid", async () => {
  const { ConvertJob } = await import("../src/convert.js");
  const t = new RecordingTransport({ status: "completed" }, { result_files: [] });
  const job = new ConvertJob(t as any, "UPLOAD-333", "JOB-777");
  await job.wait({ pollIntervalMs: 0 });
  await job.results();
  assert.ok(t.paths.includes("/api/convert/job/UPLOAD-333"), JSON.stringify(t.paths));
  assert.ok(t.paths.includes("/api/convert/job/UPLOAD-333/results"), JSON.stringify(t.paths));
  assert.ok(!t.paths.some((p) => p.includes("JOB-777")), JSON.stringify(t.paths));
});

test("poll backoff grows, caps, and jitters; server hint overrides", async () => {
  const { _nextWaitMs } = await import("../src/base.js");
  let interval = 1500;
  const seen: number[] = [];
  for (let i = 0; i < 12; i++) {
    const [s, n] = _nextWaitMs(interval, { status: "processing" });
    seen.push(s);
    interval = n;
  }
  assert.ok(seen[seen.length - 1]! > seen[0]!, "should grow");
  assert.ok(Math.max(...seen) <= 15_000 * 1.25 + 1, "should cap");
  // server hint (seconds) wins and is returned in ms
  const [hintMs, nextMs] = _nextWaitMs(2000, { status: "processing", retry_after: 30 });
  assert.equal(hintMs, 30_000);
  assert.equal(nextMs, 30_000);
  const [hintMs2] = _nextWaitMs(2000, { status: "processing", poll_after: "12" });
  assert.equal(hintMs2, 12_000);
});
