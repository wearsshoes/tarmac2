import { describe, expect, test } from "bun:test";
import { generate, render } from "../src/engine";
import { roles } from "./fixtures/seeds";

describe("determinism", () => {
  test("same seed creates byte-identical model and SVG", () => {
    const one = generate("BRAVO-NORTH-17");
    const two = generate("BRAVO-NORTH-17");
    expect(one).toEqual(two);
    expect(render(one)).toBe(render(two));
  });

  test("same seed is byte-identical across every role override", () => {
    for (const role of roles) {
      expect(render(generate("CROSS-ROLE-9", { role }))).toBe(render(generate("CROSS-ROLE-9", { role })));
    }
  });

  test("different seeds produce a varied population", () => {
    const models = Array.from({ length: 40 }, (_, i) => generate(`seed-${i}`));
    const ids = new Set(models.map((m) => m.identity.id));
    expect(ids.size).toBeGreaterThan(32);
    const headings = new Set(models.map((m) => Math.round(m.windHeading / 15)));
    expect(headings.size).toBeGreaterThan(5);
    const cities = new Set(models.map((m) => m.identity.city));
    expect(cities.size).toBeGreaterThan(30);
  });

  // Edit-plan Decisions & cuts #6: terminal draws live in their own streams, so
  // radically different terminal programs leave identity and runways untouched.
  test("stream isolation: extra terminal-detail draws do not change identity or runway summary", () => {
    const base = generate("stream-iso", { role: "major-hub", archetype: "pier" });
    const other = generate("stream-iso", { role: "major-hub", archetype: "satellite" });
    expect(other.identity).toEqual(base.identity);
    expect(other.runways).toEqual(base.runways);
    expect(other.terminalArchetype).not.toBe(base.terminalArchetype);
  });
});
