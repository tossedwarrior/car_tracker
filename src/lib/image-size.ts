/** Pixel width and height from an image's bytes (PNG, JPEG, WebP, SVG), or null. */
export function imageSize(bytes: Uint8Array, type: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (type === "image/png") return { width: view.getUint32(16), height: view.getUint32(20) };

    if (type === "image/jpeg") {
      // Walk the segments to a start-of-frame marker (SOF0–SOF15, not DHT/JPG/DAC).
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        const marker = bytes[i + 1];
        const length = view.getUint16(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
        }
        i += 2 + length;
      }
      return null;
    }

    if (type === "image/webp") {
      const chunk = String.fromCharCode(...bytes.slice(12, 16));
      if (chunk === "VP8X") {
        const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width: w, height: h };
      }
      if (chunk === "VP8 ") return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      if (chunk === "VP8L") {
        const b = view.getUint32(21, true);
        return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
      }
      return null;
    }

    if (type === "image/svg+xml") {
      const head = new TextDecoder().decode(bytes.slice(0, 2048));
      const svg = head.match(/<svg\b[^>]*>/i)?.[0] ?? "";
      const box = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
      if (box) return { width: Math.round(Number(box[1])), height: Math.round(Number(box[2])) };
      const w = svg.match(/\bwidth\s*=\s*["']([\d.]+)/i);
      const h = svg.match(/\bheight\s*=\s*["']([\d.]+)/i);
      if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
      return null;
    }
  } catch {
    return null;
  }
  return null;
}
