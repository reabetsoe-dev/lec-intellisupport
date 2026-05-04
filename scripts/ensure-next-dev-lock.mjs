import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();
const nextDir = path.join(repoRoot, ".next");
const lockFile = path.join(repoRoot, ".next", "dev", "lock");
const gitHeadFile = path.join(nextDir, ".git-head");

function hasRunningNextDevInRepo() {
  try {
    if (process.platform === "win32") {
      const escapedRepoRoot = repoRoot.replace(/'/g, "''");
      const psScript = [
        `$repo = '${escapedRepoRoot}'`,
        "$repoRegex = [Regex]::Escape($repo)",
        "$proc = Get-CimInstance Win32_Process | Where-Object {",
        "  $_.Name -match '^node(\\\\.exe)?$' -and",
        "  $_.CommandLine -match 'next\\\\s+dev' -and",
        "  $_.CommandLine -match $repoRegex",
        "} | Select-Object -First 1",
        "if ($proc) { '1' } else { '0' }",
      ].join("; ");

      const output = execSync(
        `powershell -NoProfile -NonInteractive -Command "${psScript}"`,
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim();

      return output === "1";
    }

    const output = execSync("ps -ax -o command=", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    return output
      .split(/\r?\n/)
      .some((line) => line.includes("next dev") && line.includes(repoRoot));
  } catch {
    return false;
  }
}

function getCurrentGitHead() {
  try {
    return execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function getRecordedGitHead() {
  try {
    return fs.readFileSync(gitHeadFile, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function recordGitHead(head) {
  if (!head) {
    return;
  }

  fs.mkdirSync(nextDir, { recursive: true });
  fs.writeFileSync(gitHeadFile, `${head}\n`, "utf8");
}

function clearNextArtifacts(reason) {
  try {
    fs.rmSync(nextDir, { recursive: true, force: true });
    console.log(reason);
  } catch (error) {
    console.warn("Unable to remove stale Next.js artifacts:", error);
  }
}

const currentGitHead = getCurrentGitHead();
const recordedGitHead = getRecordedGitHead();

if (!fs.existsSync(lockFile)) {
  if (fs.existsSync(nextDir) && currentGitHead && recordedGitHead !== currentGitHead) {
    clearNextArtifacts("Removed stale Next.js artifacts after a Git revision change.");
  }
  recordGitHead(currentGitHead);
  process.exit(0);
}

if (hasRunningNextDevInRepo()) {
  console.log("Active next dev process detected; keeping lock file in place.");
  process.exit(0);
}

try {
  fs.unlinkSync(lockFile);
  console.log("Removed stale Next.js dev lock file.");
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    process.exit(0);
  }
  console.warn("Unable to remove Next.js lock file:", error);
}

if (fs.existsSync(nextDir) && currentGitHead && recordedGitHead !== currentGitHead) {
  clearNextArtifacts("Removed stale Next.js artifacts after a Git revision change.");
}

recordGitHead(currentGitHead);
