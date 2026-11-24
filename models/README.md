# Models

## birefnet-lite.onnx (downloaded, not in git)

BiRefNet lite (Zheng et al., "Bilateral Reference for High-Resolution
Dichotomous Image Segmentation", 2024), from
https://github.com/ZhengPeng7/BiRefNet, licensed MIT. This ONNX export is
onnx-community's, at revision `de15b22ba131738a16dff04aab8bdf8dc32e3ac1`:
https://huggingface.co/onnx-community/BiRefNet_lite-ONNX

SHA-256 `5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333`

At 224 MB it's too big for git, so fetch it once per copy of the app:

```bash
npm run download-model
```

The script checks the SHA-256 and won't keep a file that doesn't match.

Used by `src/lib/car-photo.ts` to cut the car out of an uploaded photo, busy
backgrounds included. It works on a 1024 × 1024 copy of the photo, which
takes about 5 s and 7 GB of memory, so photos go through it one at a time. A
small shared host (GoDaddy, say) can't run it: leave it undownloaded there,
or set `CAR_PHOTO_MODEL=u2netp`, and uploads fall back to U²-Netp below.

## u2netp.onnx

U²-Netp, the small version of U²-Net (Qin et al., "U²-Net: Going Deeper with
Nested U-Structure for Salient Object Detection", 2020), from
https://github.com/xuebinqin/U-2-Net, licensed Apache 2.0. This ONNX export is
the one rembg publishes (https://github.com/danielgatis/rembg, MIT):
https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx

SHA-256 `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`

The fallback when BiRefNet isn't here (or found no car in the photo).
Used by `src/lib/car-photo.ts` to trim leftovers of a removed background off
an uploaded car photo (a strip of wall where it meets the floor, say). It runs
on the server with onnxruntime-node: about 0.2 s and 0.5 GB per photo. If it
can't be loaded, photos are prepared without it.
