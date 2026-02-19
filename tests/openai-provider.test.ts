import { describe, expect, it } from "vitest";
import { Providers } from "../src/lib/openai_provider";

describe("openai provider lookup", () => {
  it("returns known providers", () => {
    expect(Providers.get("openai").id).toBe("openai");
  });

  it("rejects inherited object properties as provider names", () => {
    expect(() => Providers.get("toString")).toThrow("Unknown provider: toString");
  });
});
