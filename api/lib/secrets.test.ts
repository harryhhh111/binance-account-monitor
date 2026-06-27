import { describe, expect, it, beforeEach } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  maskSecret,
} from "./secrets";

describe("secret helpers", () => {
  beforeEach(() => {
    process.env.SECRETS_KEY = "test-secret-key-with-enough-entropy";
  });

  it("encrypts and decrypts secret values", () => {
    const encrypted = encryptSecret("binance-api-secret");

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("binance-api-secret");
    expect(decryptSecret(encrypted)).toBe("binance-api-secret");
    expect(isEncryptedSecret(encrypted)).toBe(true);
  });

  it("keeps legacy plaintext readable while masking output", () => {
    expect(decryptSecret("legacy-plain-secret")).toBe("legacy-plain-secret");
    expect(maskSecret("legacy-plain-secret")).toBe("lega...cret");
  });
});
