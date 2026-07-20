/*
 * snapWONDERS API — JavaScript/TypeScript SDK example
 *
 * Copyright (c) 2026 Kenneth Springer @ snapWONDERS. MIT Licensed — see LICENSE.
 * Author: Kenneth Springer @ snapWONDERS <kenneth@snapwonders.com> (https://kennethbspringer.au)
 *
 * Media conversion: convert an image to another format (here JPEG → WebP).
 * Run:  SNAPWONDERS_API_KEY=sw_... node examples/convert.mjs
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@snapwonders/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "convert");

const key = process.env.SNAPWONDERS_API_KEY;
if (!key) throw new Error("Set SNAPWONDERS_API_KEY (get one at https://snapwonders.com/sign-up)");

const source = join(HERE, "assets", "sample.png");
const client = new Client(key);

// image_format: jpeg | png | webp | avif | heic | jxl. (Video uses video_format.)
console.log("Converting sample.png → webp …");
const job = await client.convert.run([source], { image_format: "webp" });
console.log(`  status: ${job.status}`);

for (const result of await job.results()) {
  const path = await result.download(OUT + "/");
  console.log(`  output → ${path}  (${result.mimeType})`);
}

console.log("Done. See", OUT);
