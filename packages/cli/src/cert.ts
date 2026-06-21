import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

export interface SslCertConfig {
  keyPath?: string;
  certPath?: string;
}

export interface SslCredentials {
  key: string;
  cert: string;
}

/**
 * Returns SSL credentials for local HTTPS development.
 * If user-defined key and cert paths are provided and exist, they are loaded.
 * Otherwise, generates a self-signed SSL certificate for localhost dynamically in the temp folder.
 */
export function getOrCreateLocalSslCert(config: SslCertConfig = {}): SslCredentials {
  if (config.keyPath && config.certPath) {
    const keyAbsPath = path.resolve(config.keyPath);
    const certAbsPath = path.resolve(config.certPath);

    if (fs.existsSync(keyAbsPath) && fs.existsSync(certAbsPath)) {
      return {
        key: fs.readFileSync(keyAbsPath, "utf-8"),
        cert: fs.readFileSync(certAbsPath, "utf-8"),
      };
    }
    console.warn(
      `[HoverSource SSL] Provided certificate files not found: ${keyAbsPath} or ${certAbsPath}. Falling back to self-signed generator.`
    );
  }

  // Fallback: Generate self-signed certificate in the OS temp directory
  const tempDir = os.tmpdir();
  const keyPath = path.join(tempDir, "hoversource-selfsigned-localhost.key");
  const certPath = path.join(tempDir, "hoversource-selfsigned-localhost.crt");

  // Re-use already generated certs in temp if they exist to avoid openssl cost on every startup
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const keyStat = fs.statSync(keyPath);
    const ageInHours = (Date.now() - keyStat.mtimeMs) / (1000 * 60 * 60);
    // Regenerate if older than 30 days
    if (ageInHours < 24 * 30) {
      return {
        key: fs.readFileSync(keyPath, "utf-8"),
        cert: fs.readFileSync(certPath, "utf-8"),
      };
    }
  }

  try {
    console.log(`[HoverSource SSL] Generating self-signed SSL certificate for localhost...`);
    // Run openssl command cross-platform.
    const command = `openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj "/CN=localhost" -keyout "${keyPath}" -out "${certPath}" -days 365`;
    execSync(command, { stdio: "ignore" });

    return {
      key: fs.readFileSync(keyPath, "utf-8"),
      cert: fs.readFileSync(certPath, "utf-8"),
    };
  } catch (err: any) {
    console.error(
      `[HoverSource SSL] Failed to generate self-signed certificate using 'openssl'. Make sure openssl is installed. Error: ${err.message}`
    );
    throw new Error(
      `[HoverSource SSL] OpenSSL execution failed. Cannot start HTTPS proxy without valid certificates.`
    );
  }
}
