import { describe, expect, it } from "vitest";
import { sceneMotion } from "./showroom";
import { wheelTurn } from "./wheels";

const stageW = 1500;
const carW = 750;
const away = stageW / 2 + carW / 2 + 48; // fully off-stage

describe("sceneMotion", () => {
  it("parks the car in the middle with its text showing", () => {
    for (const u of [-0.05, 0, 0.05]) {
      const m = sceneMotion(u, stageW, carW);
      expect(m.x).toBeCloseTo(0);
      expect(m.textOpacity).toBeGreaterThan(0.95);
    }
  });

  it("accelerates away to the left: each step covers more ground", () => {
    const xs = [0.1, 0.2, 0.3, 0.4, 0.5].map((u) => sceneMotion(u, stageW, carW).x);
    xs.forEach((x, i) => i && expect(x).toBeLessThan(xs[i - 1]));
    const steps = xs.slice(1).map((x, i) => xs[i] - x);
    steps.forEach((d, i) => i && expect(d).toBeGreaterThan(steps[i - 1]));
    expect(sceneMotion(0.6, stageW, carW)).toMatchObject({ x: -away, offStage: true });
  });

  it("drives in from the right and brakes: each step covers less ground", () => {
    expect(sceneMotion(-0.65, stageW, carW)).toMatchObject({ x: away, offStage: true });
    const xs = [-0.55, -0.45, -0.35, -0.25, -0.15].map((u) => sceneMotion(u, stageW, carW).x);
    xs.forEach((x, i) => i && expect(x).toBeLessThan(xs[i - 1]));
    const steps = xs.slice(1).map((x, i) => xs[i] - x);
    steps.forEach((d, i) => i && expect(d).toBeLessThan(steps[i - 1]));
  });

  it("never shows two cars in the middle at once", () => {
    // The leaving car is off before the next one is more than halfway in.
    for (let s = 0; s <= 1; s += 0.01) {
      const out = sceneMotion(s, stageW, carW);
      const inn = sceneMotion(s - 1, stageW, carW);
      if (!out.offStage && !inn.offStage) {
        expect(out.x).toBeLessThan(-stageW / 4);
        expect(inn.x).toBeGreaterThan(stageW / 4);
      }
    }
  });

  it("fades the next car's text up from below once it has nearly stopped", () => {
    expect(sceneMotion(-0.4, stageW, carW).textOpacity).toBe(0);
    const late = sceneMotion(-0.15, stageW, carW);
    expect(late.textOpacity).toBeGreaterThan(0);
    expect(late.textY).toBeGreaterThan(0); // still below its place
    expect(sceneMotion(0, stageW, carW).textY).toBeCloseTo(0);
  });
});

describe("wheels while driving", () => {
  it("turn anticlockwise as the car leaves, and back again when scrolling up", () => {
    const r = 0.076 * carW;
    const out = wheelTurn(sceneMotion(0.4, stageW, carW).x, r);
    expect(out).toBeLessThan(-360); // more than a full turn already
    expect(wheelTurn(sceneMotion(0.2, stageW, carW).x, r)).toBeGreaterThan(out);
  });
});
