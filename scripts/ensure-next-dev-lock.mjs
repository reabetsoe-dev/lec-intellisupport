import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = process.cwd();
const lockFile = path.join(repoRoot, ".next", "dev", "lock");

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

if (!fs.existsSync(lockFile)) {
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
