import { maxIso, shortStamp, shortStampLocal } from "./format";

describe("shortStamp vs shortStampLocal", () => {
  const iso = "2026-09-12T18:00:00.000Z";

  it("shortStamp is always Eastern", () => {
    expect(shortStamp(iso)).toBe("Sat 14:00");
  });

  it("shortStampLocal follows the runtime timezone, not ET", () => {
    const local = new Date(iso).toLocaleString("en-US", {
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(shortStampLocal(iso)).toBe(local);
  });
});

describe("maxIso", () => {
  it("returns the latest instant", () => {
    expect(maxIso(["2026-09-12T17:00:00.000Z", "2026-09-12T18:10:00.000Z", null])).toBe(
      "2026-09-12T18:10:00.000Z",
    );
  });

  it("returns null when nothing is dated", () => {
    expect(maxIso([null, undefined])).toBeNull();
  });
});
