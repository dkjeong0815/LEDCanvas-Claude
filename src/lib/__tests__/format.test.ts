import { describe, expect, it } from "vitest";
import { cm } from "../format";

describe("cm", () => {
  it("drops a decimal a whole number never had", () => {
    expect(cm(64)).toBe("64");
    expect(cm(128)).toBe("128");
    expect(cm(192)).toBe("192");
  });

  it("keeps the decimals a real measurement carries", () => {
    // A COB cabinet is 33.75 cm tall; rounding it away would be a lie.
    expect(cm(33.75)).toBe("33.75");
    expect(cm(67.5)).toBe("67.5");
    expect(cm(101.25)).toBe("101.25");
  });

  it("rounds the noise a float multiplication leaves behind", () => {
    expect(cm(33.75 * 3)).toBe("101.25");
    expect(cm(0.1 + 0.2)).toBe("0.3");
  });
});
