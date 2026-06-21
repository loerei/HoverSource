import { vi, describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as child_process from "node:child_process";

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof child_process>();
  return {
    ...original,
    execSync: vi.fn((cmd, options) => {
      if (typeof cmd === "string" && cmd.includes("certutil")) {
        if (cmd.includes("-verifystore")) {
          throw new Error("Certificate not found");
        }
        return Buffer.from("mock success");
      }
      return original.execSync(cmd, options);
    }),
  };
});

import { ensureRootCa, getOrCreateCaSignedCert } from "../cert-ca.js";

describe("Root CA and Signed Certificates", () => {
  it("should ensure Root CA keys are created", () => {
    const { caKeyPath, caCertPath } = ensureRootCa();

    expect(fs.existsSync(caKeyPath)).toBe(true);
    expect(fs.existsSync(caCertPath)).toBe(true);

    const certContent = fs.readFileSync(caCertPath, "utf-8");
    expect(certContent).toContain("-----BEGIN CERTIFICATE-----");
    expect(certContent).toContain("-----END CERTIFICATE-----");
  });

  it("should generate a CA-signed domain certificate for localhost", () => {
    const creds = getOrCreateCaSignedCert("localhost");

    expect(creds.key).toContain("-----BEGIN PRIVATE KEY-----");
    expect(creds.cert).toContain("-----BEGIN CERTIFICATE-----");
  });

  it("should generate a CA-signed domain certificate for a custom HSTS domain", () => {
    const creds = getOrCreateCaSignedCert("my-app.dev");

    expect(creds.key).toContain("-----BEGIN PRIVATE KEY-----");
    expect(creds.cert).toContain("-----BEGIN CERTIFICATE-----");

    // Clean up temp generated cert files if any
    const safeHost = "my-app.dev".replace(/[^a-zA-Z0-9.-]/g, "_");
    const tempDir = os.tmpdir();
    const keyPath = path.join(tempDir, `hoversource-signed-${safeHost}.key`);
    const certPath = path.join(tempDir, `hoversource-signed-${safeHost}.crt`);

    expect(fs.existsSync(keyPath)).toBe(true);
    expect(fs.existsSync(certPath)).toBe(true);
  });
});
