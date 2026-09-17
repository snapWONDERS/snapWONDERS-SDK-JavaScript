/*
 * snapWONDERS API — JavaScript/TypeScript SDK example
 *
 * Copyright (c) 2026 Kenneth Springer @ snapWONDERS. MIT Licensed — see LICENSE.
 * Author: Kenneth Springer @ snapWONDERS <kenneth@snapwonders.com> (https://kennethbspringer.au)
 *
 * Steganography: hide a secret file inside a cover image, then reveal it back out.
 * Run:  SNAPWONDERS_API_KEY=sw_... node examples/hide-and-reveal.mjs
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@snapwonders/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");

const key = process.env.SNAPWONDERS_API_KEY;
if (!key) throw new Error("Set SNAPWONDERS_API_KEY (get one at https://snapwonders.com/sign-up)");

const client = new Client(key);

// A "secret" (any media file) and a "cover" image to hide it inside. The secret and cover must be
// two different files, and the cover's shortest side must be at least 512px.
const secret = join(HERE, "assets", "secret.png");
const cover = join(HERE, "assets", "sample.png");

console.log("Hiding — create session, upload both files, run the job, wait …");
const job = await client.stego.hide([secret, cover], { password: "Str0ng!Pass" });
console.log(`  status: ${job.status}`);

let stego;
for (const result of await job.results()) {
  stego = await result.download(OUT + "/"); // a trailing "/" writes into the directory
  console.log(`  stego image → ${stego}`);
}

console.log("Revealing the hidden file back out …");
const revealed = await client.stego.reveal(stego, { password: "Str0ng!Pass" });
for (const result of await revealed.results()) {
  const path = await result.download(join(OUT, "recovered") + "/");
  console.log(`  recovered → ${path}`);
}

console.log("Done. See", OUT);
