$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$noisyFiles = @(
  "backend/backend-server.err.log",
  "backend/backend-server.out.log",
  "backend/db.sqlite3"
)

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  & git @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed."
  }
}

function Get-ModifiedTrackedFiles {
  param([string]$Glob)
  $tracked = & git ls-files -m -- $Glob
  if ($LASTEXITCODE -ne 0) {
    throw "git ls-files -m -- $Glob failed."
  }
  return @($tracked | Where-Object { $_ -and $_.Trim() })
}

$modifiedPycFiles = Get-ModifiedTrackedFiles "*.pyc"
$restoreTargets = @($noisyFiles + $modifiedPycFiles) | Sort-Object -Unique

try {
  if ($noisyFiles.Count -gt 0) {
    Invoke-Git update-index --no-skip-worktree @noisyFiles
  }
  if ($restoreTargets.Count -gt 0) {
    Invoke-Git restore @restoreTargets
  }
  Invoke-Git pull --rebase --autostash
}
finally {
  Invoke-Git update-index --skip-worktree @noisyFiles
}

Write-Host "Sync completed."
