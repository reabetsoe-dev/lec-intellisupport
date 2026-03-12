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

try {
  Invoke-Git update-index --no-skip-worktree @noisyFiles
  Invoke-Git restore @noisyFiles
  Invoke-Git pull --rebase --autostash
}
finally {
  Invoke-Git update-index --skip-worktree @noisyFiles
}

Write-Host "Sync completed."
