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
    // forensic / audio_splice / video_tamper carry the WHY behind the grade.
    if (v.forensic?.ela) {
      console.log(`    ELA          : ${v.forensic.ela.high_fraction} high-residual, ${v.forensic.ela.anomaly_tile_count} anomaly tile(s)`);
    }
    if (v.forensic?.noise_inconsistency) {
      console.log(`    noise map    : ${v.forensic.noise_inconsistency.anomaly_tile_count} anomaly tile(s)`);
    }
    if (v.audio_splice) {
      console.log(`    audio splice : ${v.audio_splice.verdict} (${v.audio_splice.spike_count} spike(s), noise CoV ${v.audio_splice.noise_cov})`);
    }
    if (v.video_tamper?.inter_frame_tamper) {
      const t = v.video_tamper.inter_frame_tamper;
      console.log(`    inter-frame  : ${t.verdict} (${t.spike_count} spike(s) / ${t.frame_count_checked} frames checked)`);
    }
    if (v.video_tamper?.frame_duplicate) {
      const d = v.video_tamper.frame_duplicate;
      console.log(`    dup frames   : ${d.dup_verdict} (${d.dup_count} duplicate(s))`);
    }
    if (v.video_tamper?.gps_triangle?.applicable) {
      const g = v.video_tamper.gps_triangle;
      console.log(`    GPS triangle : ${g.verdict} (Δ${g.delta_secs}s, ${g.timezone})`);
    }
  }
  for (const asset of item.assets) {        // e.g. ELA map, face overlay
    const path = await asset.download(OUT + "/");
    console.log(`    asset        : ${asset.name} → ${path}`);
  }
}

console.log("\nDone. See", OUT);
