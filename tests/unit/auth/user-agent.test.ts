import { describe, expect, it } from "vitest";
import { describeUserAgent } from "../../../apps/auth/src/user-agent";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";

describe("describeUserAgent", () => {
  it("reads Chrome on Windows", () => {
    expect(describeUserAgent(CHROME_WINDOWS)).toBe("Chrome 120 Windows");
  });

  it("reads Safari on iOS", () => {
    expect(describeUserAgent(SAFARI_IOS)).toBe("Safari 17 iOS");
  });

  it("reads Firefox on Linux", () => {
    expect(describeUserAgent(FIREFOX_LINUX)).toBe("Firefox 121 Linux");
  });

  it("prefers Edge over the Chrome token it also carries", () => {
    expect(describeUserAgent(EDGE_WINDOWS)).toBe("Edge 120 Windows");
  });

  it("reports Unknown for a missing or blank header", () => {
    expect(describeUserAgent(null)).toBe("Unknown");
    expect(describeUserAgent("  ")).toBe("Unknown");
  });

  it("reports Unknown rather than guessing at an unrecognised string", () => {
    expect(describeUserAgent("SomeCustomClient/1.0")).toBe("Unknown");
  });
});
