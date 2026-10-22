# Examples — snapWONDERS JavaScript/TypeScript SDK

Runnable, self-contained examples (plain ESM, Node ≥ 18). Each needs an API key
([sign up free](https://snapwonders.com/sign-up)) in the `SNAPWONDERS_API_KEY` environment variable.

```bash
npm install @snapwonders/sdk     # or, from this repo:  npm install && npm run build
export SNAPWONDERS_API_KEY=sw_your_key_here

node examples/hide-and-reveal.mjs      # steganography: hide a file in an image, then reveal it
node examples/analyse.mjs              # forensic analysis: grade an image A–F + overlay assets
node examples/convert.mjs              # media conversion: JPEG → WebP
```

Outputs are written to `examples/out/` (git-ignored). `assets/sample.png` is a generated placeholder
— pass your own image to `analyse.mjs` (`node examples/analyse.mjs my-photo.jpg`) or swap the file in
`assets/` for richer results.

## See it in action

[**WALKTHROUGH.md**](WALKTHROUGH.md) shows the real input/output images and a real forensic analysis JSON result from running these examples.
