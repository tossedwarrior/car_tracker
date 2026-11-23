# Models

## u2netp.onnx

U²-Netp, the small version of U²-Net (Qin et al., "U²-Net: Going Deeper with
Nested U-Structure for Salient Object Detection", 2020), from
https://github.com/xuebinqin/U-2-Net, licensed Apache 2.0. This ONNX export is
the one rembg publishes (https://github.com/danielgatis/rembg, MIT):
https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx

SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`

Used by `src/lib/car-photo.ts` to trim leftovers of a removed background off
an uploaded car photo (a strip of wall where it meets the floor, say). It runs
on the server with onnxruntime-node: about 0.2 s and 0.5 GB per photo. If it
can't be loaded, photos are prepared without it.
