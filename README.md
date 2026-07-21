<p align="center">
    <a href="https://www.snapwonders.com/" target="_blank">
        <img src="https://raw.githubusercontent.com/snapWONDERS/snapWONDERS-SDK-JavaScript/main/.github/social-preview.jpg" alt="snapWONDERS JavaScript / TypeScript SDK" width="640" />
    </a>
</p>

snapWONDERS — Expose what's hidden. Hide what's yours.


# @snapwonders/sdk — JavaScript / TypeScript client for the snapWONDERS API

The official JavaScript/TypeScript client for the snapWONDERS API: steganography, forensic media
analysis, and format conversion. The client wraps the resumable TUS upload and the
session → job → poll → download choreography so that a whole job is a couple of `await`s. Zero
runtime dependencies — it uses the global `fetch` (Node ≥ 18).

All the snapWONDERS API services are available over the Clearnet / **Web** and Dark Web **Tor** and
**I2P**.

> **Status.** Published — `npm install @snapwonders/sdk` (`0.1.0`).


# See it in action

Hide a secret image inside a cover — the stego output looks pixel-identical, but carries the hidden
file, recoverable only with the password:

| Secret (hidden inside) | Cover (input) | Stego output (carries the secret) |
|---|---|---|
| ![secret](https://raw.githubusercontent.com/snapWONDERS/snapWONDERS-SDK-JavaScript/main/examples/assets/secret.png) | ![cover](https://raw.githubusercontent.com/snapWONDERS/snapWONDERS-SDK-JavaScript/main/examples/sample-output/input.png) | ![stego](https://raw.githubusercontent.com/snapWONDERS/snapWONDERS-SDK-JavaScript/main/examples/sample-output/stego-output.webp) |

The full walkthrough — steganography, forensic analysis (with a real graded result), and conversion —
is in **[`examples/WALKTHROUGH.md`](https://github.com/snapWONDERS/snapWONDERS-SDK-JavaScript/blob/main/examples/WALKTHROUGH.md)**.


# Installation and setup

## snapWONDERS API key
You will need a snapWONDERS API key before you can get started:

* Sign up and create an account at [snapWONDERS sign-up](https://snapwonders.com/sign-up). If you
  wish to create an account via Tor or I2P then you can do so by accessing snapWONDERS through the
  Tor or I2P portals. For the dark web links visit
  [browsing safely](https://snapwonders.com/browsing-safely).
* Under your account settings, generate an API key. New keys start with `sw_`. It is sent as the
  `X-Api-Key` header on every request — keep it secret.

## Install the package

```bash
npm install @snapwonders/sdk
```


# Quickstart

```ts
import { Client } from "@snapwonders/sdk";

const client = new Client("sw_your_key_here"); // baseUrl defaults to https://snapwonders.com
console.log(await client.status());              // no key needed for status

// Hide a secret inside a cover image (the last file is the cover).
const job = await client.stego.hide(["secret.png", "cover.jpg"], { password: "Str0ng!Pass" });
for (const result of await job.results()) {
  await result.download("out/");                 // "out/" is a directory — the server filename is kept
}

// Reveal it again.
const revealed = await client.stego.reveal("out/cover-share.avif", { password: "Str0ng!Pass" });
await (await revealed.results())[0].download("recovered/");
```

`client.analyse` (forensic analysis) and `client.convert` (media conversion) follow the same shape —
one call in, results out:

```ts
// Forensic analysis — grade each file A–F.
const analysis = await client.analyse.run(["photo.jpg"], { face_detection: true });
for (const item of await analysis.results()) {
  console.log(item.filename, item.grade, item.faceCount);
}

// Convert media — the image format key is `image_format` (jpeg/png/webp/avif/heic/jxl).
const converted = await client.convert.run(["photo.png"], { image_format: "webp" });
await (await converted.results())[0].download("out/");
```


# Examples

Runnable end-to-end examples live in [`examples/`](https://github.com/snapWONDERS/snapWONDERS-SDK-JavaScript/tree/main/examples) — steganography, forensic analysis,
and conversion, each a self-contained script (plain ESM) with a bundled sample image:

```bash
export SNAPWONDERS_API_KEY=sw_your_key_here
node examples/hide-and-reveal.mjs      # hide a file in an image, then reveal it
node examples/analyse.mjs              # grade an image A–F + download overlay assets
node examples/convert.mjs              # JPEG → WebP
```

See [`examples/WALKTHROUGH.md`](https://github.com/snapWONDERS/snapWONDERS-SDK-JavaScript/blob/main/examples/WALKTHROUGH.md) for the real input/output images and a live forensic-analysis JSON result, or [`examples/README.md`](https://github.com/snapWONDERS/snapWONDERS-SDK-JavaScript/blob/main/examples/README.md) for how to run them.


# Errors

Every failure the SDK raises is a subclass of `SnapwondersError`, so you can branch on the kind of
failure rather than inspecting HTTP status codes: `AuthError`, `ProRequiredError`,
`SessionExpiredError`, `RateLimitError`, `MaintenanceError`, `JobFailedError`, `TusUploadError`,
`NetworkError`, `ApiError`.


# Running the tests

```bash
npm install
npm run typecheck    # tsc --noEmit
npm test             # offline smoke tests (no key required), via tsx
npm run build        # emit dist/
```


# Documentation

Useful documentation can be found at:

* The interactive Swagger UI and full endpoint reference:
  [snapWONDERS API](https://snapwonders.com/api)
* A guided, step-by-step integration walkthrough:
  [snapWONDERS Developers](https://snapwonders.com/developers)


# Contact

## For security concerns
If you have spotted any security concerns then please reach out via
[contacting snapWONDERS](https://snapwonders.com/contact) and set the subject to
**"SECURITY CONCERNS"** and provide the information about your concerns. If you wish to contact via
Tor or I2P then you can do so by accessing snapWONDERS through the Tor or I2P portals. For the dark
web links visit [browsing safely](https://snapwonders.com/browsing-safely).

## For FAQ and questions
It may be that your question is already answered in the [FAQ](https://snapwonders.com/faq). Be sure
to check the FAQ content first. Otherwise you may reach out via
[contacting snapWONDERS](https://snapwonders.com/contact).

## For contacting the author
Use this link to contact the author [Kenneth Springer](https://kennethbspringer.au/).


# Licence

MIT — Copyright (c) 2026 Kenneth Springer @ snapWONDERS. See [LICENSE](https://github.com/snapWONDERS/snapWONDERS-SDK-JavaScript/blob/main/LICENSE).

**Scope.** The MIT licence covers **this client library only**. It grants no rights in the
snapWONDERS API, service, data, models, or algorithms it communicates with — these are **proprietary**
and remain the property of Kenneth Springer @ snapWONDERS. This library only sends HTTP requests to
the API; it contains none of its implementation. Using the API requires a valid API key and is
governed by the [snapWONDERS Terms of Service](https://snapwonders.com/terms).
