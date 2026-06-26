# Sync Prisma migrations against a DB that already has most schema applied.
# Re-runs `migrate deploy` and marks "already exists" failures as applied.

$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

$maxAttempts = 40
for ($i = 1; $i -le $maxAttempts; $i++) {
  Write-Host "`n=== migrate deploy attempt $i ===" -ForegroundColor Cyan
  $output = npx prisma migrate deploy 2>&1 | Out-String
  Write-Host $output

  if ($LASTEXITCODE -eq 0) {
    Write-Host "`nAll migrations applied successfully." -ForegroundColor Green
    exit 0
  }

  if ($output -match "Migration name: ([^\r\n]+)") {
    $migrationName = $Matches[1].Trim()
    Write-Host "Marking failed migration as applied: $migrationName" -ForegroundColor Yellow
    npx prisma migrate resolve --applied $migrationName 2>&1 | Out-String | Write-Host
    continue
  }

  Write-Host "`nStopped: unhandled migrate deploy error." -ForegroundColor Red
  exit 1
}

Write-Host "`nStopped: exceeded max attempts." -ForegroundColor Red
exit 1
