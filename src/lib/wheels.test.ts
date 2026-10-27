import { describe, expect, it } from "vitest";
import { imageSize } from "./image-size";
import { guessWheels, parseWheels, wheelStyle, wheelTurn } from "./wheels";

describe("parseWheels", () => {
  it("accepts two wheels as fractions of the photo, and rejects anything else", () => {
    const ok = JSON.stringify({ front: { x: 0.2, y: 0.7, r: 0.08 }, rear: { x: 0.8, y: 0.7, r: 0.08 } });
    expect(parseWheels(ok)).toEqual({ front: { x: 0.2, y: 0.7, r: 0.08 }, rear: { x: 0.8, y: 0.7, r: 0.08 } });
    expect(parseWheels(JSON.stringify({ front: { x: 2, y: 0.7, r: 0.08 }, rear: { x: 0.8, y: 0.7, r: 0.08 } }))).toBeNull();
    expect(parseWheels("not json")).toBeNull();
    expect(parseWheels(null)).toBeNull();
  });
});

describe("guessWheels", () => {
  it("puts the front wheel at the end the car faces, resting on the bottom edge", () => {
    const left = guessWheels(0.3);
    expect(left.front.x).toBeLessThan(left.rear.x);
    expect(left.front.y * 0.3 + left.front.r).toBeCloseTo(0.3); // bottom of the wheel = bottom of the photo
    expect(guessWheels(0.3, true).front.x).toBeGreaterThan(guessWheels(0.3, true).rear.x);
  });
});

describe("wheelStyle", () => {
  it("cuts the wheel's circle out of the photo at the wheel's position", () => {
    // A 1000 x 300 photo with a wheel centred at (200, 210), radius 80px.
    const s = wheelStyle({ x: 0.2, y: 0.7, r: 0.08 }, 0.3, "/car.png");
    expect(s.left).toBe(`${(0.12 * 100).toFixed(0)}%`);
    expect(parseFloat(s.top)).toBeCloseTo(((210 - 80) / 300) * 100); // 43.3% of the height
    expect(parseFloat(s.width)).toBeCloseTo(16);
    expect(parseFloat(s.backgroundSize)).toBeCloseTo(625); // photo = 6.25 wheel widths
    const [bx, by] = s.backgroundPosition.split(" ").map(parseFloat);
    expect(bx).toBeCloseTo((120 / (1000 - 160)) * 100); // 120px offset over 840px of travel
    expect(by).toBeCloseTo((130 / (300 - 160)) * 100); // 130px offset over 140px of travel
  });
});

describe("wheelTurn", () => {
  it("rolls one full turn per circumference, anticlockwise when driving left", () => {
    expect(wheelTurn(-2 * Math.PI * 50, 50)).toBeCloseTo(-360);
    expect(wheelTurn(100, 0)).toBe(0);
  });
});

describe("imageSize", () => {
  it("reads PNG and SVG sizes", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    new DataView(png.buffer).setUint32(16, 1800);
    new DataView(png.buffer).setUint32(20, 540);
    expect(imageSize(png, "image/png")).toEqual({ width: 1800, height: 540 });
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 180">');
    expect(imageSize(svg, "image/svg+xml")).toEqual({ width: 400, height: 180 });
  });
});
