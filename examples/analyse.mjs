/*
 * snapWONDERS API — JavaScript/TypeScript SDK example
 *
 * Copyright (c) 2026 Kenneth Springer @ snapWONDERS. MIT Licensed — see LICENSE.
 * Author: Kenneth Springer @ snapWONDERS <kenneth@snapwonders.com> (https://kennethbspringer.au)
 *
 * Forensic analysis: grade an image A–F and download the overlay assets it produces.
 * Run:  SNAPWONDERS_API_KEY=sw_... node examples/analyse.mjs [path/to/image.jpg]
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "@snapwonders/sdk";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out", "analyse");

const key = process.env.SNAPWONDERS_API_KEY;
if (!key) throw new Error("Set SNAPWONDERS_API_KEY (get one at https://snapwonders.com/sign-up)");

const image = process.argv[2] ?? join(HERE, "assets", "sample.png");
const client = new Client(key);

console.log(`Analysing ${image} …`);
const job = await client.analyse.run([image], { face_detection: true });
console.log(`  status: ${job.status}`);

for (const item of await job.results()) {
  console.log(`\n  ${item.filename}`);
  console.log(`    grade        : ${item.grade}`);
  console.log(`    faces        : ${item.faceCount}`);
  console.log(`    text regions : ${item.textRegionCount}`);
  console.log(`    watermark    : ${item.watermarkFlagged}`);
  const v = item.verdicts ?? {};
  if (Object.keys(v).length) {
    console.log(`    AI generation: ${v.ai_generation?.verdict}`);
    console.log(`    C2PA         : ${v.c2pa?.verdict}`);
    console.log(`    camera match : ${v.camera_fingerprint?.encoder_name}`);
    for (const f of v.findings ?? []) console.log(`    finding      : ${f.label} (${f.severity})`);
  }
  for (const asset of item.assets) {        // e.g. ELA map, face overlay
    const path = await asset.download(OUT + "/");
    console.log(`    asset        : ${asset.name} → ${path}`);
  }
}

console.log("\nDone. See", OUT);
