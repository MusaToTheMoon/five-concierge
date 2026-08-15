/**
 * Hardware and software environment capture, shared by every bench tier so
 * results are self-describing without rerunning anything to find out what
 * machine produced them.
 *
 * Plain relative imports only, no `@/` alias: used from both Vitest bench
 * files and plain tsx scripts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

/** Packages whose exact resolved version matters for reproducing a run. */
const TRACKED_PACKAGES = [
  "@google/genai",
  "@upstash/ratelimit",
  "@upstash/redis",
  "@vercel/functions",
  "next",
  "vitest",
];

export interface Environment {
  capturedAt: string;
  node: string;
  npm: string;
  os: { platform: string; release: string; arch: string };
  cpu: { model: string; cores: number };
  memoryBytes: number;
  packages: Record<string, string>;
}

function readInstalledVersion(pkg: string): string {
  try {
    const pkgJsonPath = path.join(process.cwd(), "node_modules", pkg, "package.json");
    const data = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8")) as { version: string };
    return data.version;
  } catch {
    return "unknown";
  }
}

function readNpmVersion(): string {
  try {
    return execSync("npm --version", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export function collectEnvironment(): Environment {
  const cpus = os.cpus();
  const packages: Record<string, string> = {};
  for (const pkg of TRACKED_PACKAGES) packages[pkg] = readInstalledVersion(pkg);
  return {
    capturedAt: new Date().toISOString(),
    node: process.version,
    npm: readNpmVersion(),
    os: { platform: os.platform(), release: os.release(), arch: os.arch() },
    cpu: { model: cpus[0]?.model ?? "unknown", cores: cpus.length },
    memoryBytes: os.totalmem(),
    packages,
  };
}
