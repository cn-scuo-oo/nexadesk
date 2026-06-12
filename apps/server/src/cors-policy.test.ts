import { describe, expect, it } from "vitest";
import { isAllowedLocalOrigin } from "./cors-policy";

describe("cors policy", () => {
  it("allows only local origins and null origin", () => {
    expect(isAllowedLocalOrigin(undefined)).toBe(true);
    expect(isAllowedLocalOrigin("null")).toBe(true);
    expect(isAllowedLocalOrigin("http://127.0.0.1:5173")).toBe(true);
    expect(isAllowedLocalOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedLocalOrigin("http://192.168.1.10:5173")).toBe(false);
    expect(isAllowedLocalOrigin("https://example.com")).toBe(false);
  });
});
