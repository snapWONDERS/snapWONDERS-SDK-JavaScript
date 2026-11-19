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
 * Which upload method runs, and why. Offline — the transport is a stub, nothing leaves the machine.
 *
 * The choice is invisible to callers, which is the point of the router but also means a wrong
 * choice fails somewhere far from its cause: a large file sent direct is rejected by the server,
 * and a small file sent over TUS just quietly costs three round trips instead of one. These pin
 * the boundary so neither can regress unnoticed.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as router from "../src/uploadRouter.js";
import { DEFAULT_MAX_BYTES } from "../src/direct.js";
import { UploadError, TusUploadError } from "../src/index.js";
import type { HttpTransport } from "../src/http.js";

/** Records the request the router made without performing one. */
function stubTransport(storageUid: string | null = "stg_abc123") {
  const calls: { method: string; path: string; headers: Record<string, string> }[] = [];
  const t = {
    calls,
    async request(method: string, path: string, opts: any = {}) {
      calls.push({ method, path, headers: opts.headers ?? {} });
      return {
        async json() {
          return storageUid ? { file: { storage_uid: storageUid } } : {};
        },
      } as unknown as Response;
    },
  };
  return t as unknown as HttpTransport & { calls: typeof calls };
}

async function withFile(bytes: number, fn: (p: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), "sw-upload-"));
  const p = join(dir, "sample.bin");
  await writeFile(p, Buffer.alloc(bytes));
  try {
    await fn(p);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("a small file goes direct, in one request", async () => {
  await withFile(1024, async (p) => {
    const t = stubTransport();
    const out = await router.uploadFile(t, p, "upl_1", 1);
    assert.equal(out, "stg_abc123");
    assert.equal(t.calls.length, 1, "direct upload is a single request");
    assert.equal(t.calls[0].method, "POST");
    assert.equal(t.calls[0].path, "/api/upload");
  });
});

test("the server's cap wins over the built-in default", async () => {
  // 4 KB file, but the server says the cap is 1 KB — must not go direct.
  await withFile(4096, async (p) => {
    const t = stubTransport();
    await assert.rejects(
      () => router.uploadFile(t, p, "upl_1", 1, 1024),
      // Falls through to TUS, which the stub cannot satisfy; the point is that it did NOT
      // take the direct path, which the stub would have answered happily.
      (e: unknown) => e instanceof Error,
    );
    assert.ok(
      t.calls.every((c) => c.path !== "/api/upload"),
      "over the reported cap, direct upload must not be attempted",
    );
  });
});

test("exactly at the cap still goes direct — the boundary is inclusive", async () => {
  await withFile(2048, async (p) => {
    const t = stubTransport();
    await router.uploadFile(t, p, "upl_1", 1, 2048);
    assert.equal(t.calls[0].path, "/api/upload");
  });
});

test("direct upload sends the headers the endpoint requires", async () => {
  await withFile(16, async (p) => {
    const t = stubTransport();
    await router.uploadFile(t, p, "upl_xyz", 2);
    const h = t.calls[0].headers;
    // X-Upload-Uid is required — without it the endpoint answers 404 unknown_session.
    assert.equal(h["X-Upload-Uid"], "upl_xyz");
    assert.equal(h["X-Upload-Step"], "2");
    assert.equal(h["X-Filename"], "sample.bin");
    // Idempotency: a retry after a lost response must not store the file twice.
    assert.ok(h["X-Client-Upload-Id"], "X-Client-Upload-Id must be sent");
  });
});

test("a response without storage_uid is an error, not a silent success", async () => {
  await withFile(16, async (p) => {
    const t = stubTransport(null);
    await assert.rejects(() => router.uploadFile(t, p, "upl_1", 1), UploadError);
  });
});

test("a missing file fails before any request is made", async () => {
  const t = stubTransport();
  await assert.rejects(
    () => router.uploadFile(t, "/definitely/not/here.bin", "upl_1", 1),
    UploadError,
  );
  assert.equal(t.calls.length, 0);
});

test("TusUploadError is catchable as UploadError", () => {
  // Both paths are chosen for the caller by file size, so catching only the TUS-specific error
  // would mean catching one that fires for some file sizes and not others.
  assert.ok(new TusUploadError("x") instanceof UploadError);
});

test("the built-in cap matches the server's documented fallback", () => {
  assert.equal(DEFAULT_MAX_BYTES, 99_614_720);
});
