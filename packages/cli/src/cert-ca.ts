import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { SslCredentials } from "./cert.js";

/**
 * Returns the path/command for openssl.
 * Fallbacks to Git for Windows openssl path if default openssl is not in the system path.
 */
export function getOpensslCommand(): string {
  if (process.platform === "win32") {
    try {
      execSync("openssl version", { stdio: "ignore" });
      return "openssl";
    } catch {
      const gitOpenssl = "C:\\Program Files\\Git\\usr\\bin\\openssl.exe";
      if (fs.existsSync(gitOpenssl)) {
        return `"${gitOpenssl}"`;
      }
    }
  }
  return "openssl";
}

/**
 * Ensures the Root CA certificate exists and is registered in the OS Trusted Root store.
 * Returns the path to the CA key and certificate files.
 */
export function ensureRootCa(): { caKeyPath: string; caCertPath: string } {
  const sslDir = path.join(os.homedir(), ".hoversource", "ssl");
  if (!fs.existsSync(sslDir)) {
    fs.mkdirSync(sslDir, { recursive: true });
  }

  const caKeyPath = path.join(sslDir, "ca.key");
  const caCertPath = path.join(sslDir, "ca.pem");
  const openssl = getOpensslCommand();

  // 1. Generate Root CA files if they don't exist
  if (!fs.existsSync(caKeyPath) || !fs.existsSync(caCertPath)) {
    try {
      console.log(`[HoverSource SSL CA] Generating Root CA keys in ${sslDir}...`);
      const cmd = `${openssl} req -x509 -nodes -new -sha256 -days 3650 -newkey rsa:2048 -keyout "${caKeyPath}" -out "${caCertPath}" -subj "/CN=HoverSourceRootCA"`;
      execSync(cmd, { stdio: "ignore" });
    } catch (err: any) {
      console.error(`[HoverSource SSL CA] Failed to generate Root CA:`, err.message);
      throw new Error(`Failed to generate local Root CA keys. Please check openssl configuration.`);
    }
  }

  // 2. Register Root CA to Windows Trusted Root store if not already done (Windows specific)
  if (process.platform === "win32") {
    try {
      // Check if certificate is already trusted
      execSync(`certutil -verifystore -user root "HoverSourceRootCA"`, { stdio: "ignore" });
    } catch {
      try {
        console.log(`[HoverSource SSL CA] Trusting HoverSource Development Root CA...`);
        execSync(`certutil -addstore -user root "${caCertPath}"`, { stdio: "ignore" });
      } catch (err: any) {
        console.warn(`[HoverSource SSL CA] Warning: Failed to trust Root CA in Windows certificate store:`, err.message);
      }
    }
  }

  return { caKeyPath, caCertPath };
}

/**
 * Generates and signs a local domain SSL certificate for the specified target host
 * using the HoverSource Root CA.
 */
export function getOrCreateCaSignedCert(targetHost: string): SslCredentials {
  const { caKeyPath, caCertPath } = ensureRootCa();
  const tempDir = os.tmpdir();
  const openssl = getOpensslCommand();
  
  // Clean host name for filenames
  const safeHost = targetHost.replace(/[^a-zA-Z0-9.-]/g, "_");
  const domainKeyPath = path.join(tempDir, `hoversource-signed-${safeHost}.key`);
  const domainCertPath = path.join(tempDir, `hoversource-signed-${safeHost}.crt`);
  const domainCsrPath = path.join(tempDir, `hoversource-signed-${safeHost}.csr`);
  const extConfigPath = path.join(tempDir, `hoversource-ext-${safeHost}.conf`);

  // Check if it already exists and is relatively new (less than 30 days old)
  if (fs.existsSync(domainKeyPath) && fs.existsSync(domainCertPath)) {
    const keyStat = fs.statSync(domainKeyPath);
    const ageInHours = (Date.now() - keyStat.mtimeMs) / (1000 * 60 * 60);
    if (ageInHours < 24 * 30) {
      return {
        key: fs.readFileSync(domainKeyPath, "utf-8"),
        cert: fs.readFileSync(domainCertPath, "utf-8"),
      };
    }
  }

  try {
    // Generate extension config containing SAN (Subject Alternative Names)
    const dnsNames = ["localhost", "127.0.0.1"];
    if (targetHost && targetHost !== "localhost" && targetHost !== "127.0.0.1") {
      dnsNames.push(targetHost);
    }

    const altNames = dnsNames.map((name, index) => {
      const isIp = /^[0-9.]+$/.test(name);
      return `${isIp ? "IP" : "DNS"}.${index + 1} = ${name}`;
    }).join("\n");

    const extConfig = `authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
${altNames}
`;

    fs.writeFileSync(extConfigPath, extConfig, "utf-8");

    // Generate Private Key and CSR for Domain
    const reqCmd = `${openssl} req -new -newkey rsa:2048 -nodes -keyout "${domainKeyPath}" -out "${domainCsrPath}" -subj "/CN=${targetHost}"`;
    execSync(reqCmd, { stdio: "ignore" });

    // Sign CSR with Root CA using Extension config
    const signCmd = `${openssl} x509 -req -in "${domainCsrPath}" -CA "${caCertPath}" -CAkey "${caKeyPath}" -CAcreateserial -out "${domainCertPath}" -days 365 -sha256 -extfile "${extConfigPath}"`;
    execSync(signCmd, { stdio: "ignore" });

    // Clean up temporary config and CSR
    try {
      fs.unlinkSync(extConfigPath);
      fs.unlinkSync(domainCsrPath);
      const serialPath = path.join(tempDir, `hoversource-signed-${safeHost}.srl`);
      if (fs.existsSync(serialPath)) fs.unlinkSync(serialPath);
      const localSerialPath = "ca.srl"; // Openssl sometimes places CA serial file in cwd
      if (fs.existsSync(localSerialPath)) fs.unlinkSync(localSerialPath);
    } catch {}

    return {
      key: fs.readFileSync(domainKeyPath, "utf-8"),
      cert: fs.readFileSync(domainCertPath, "utf-8"),
    };
  } catch (err: any) {
    console.error(`[HoverSource SSL CA] Failed to generate signed certificate for ${targetHost}:`, err.message);
    throw new Error(`OpenSSL signed cert generation failed: ${err.message}`);
  }
}
