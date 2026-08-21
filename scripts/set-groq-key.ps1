# 把新 Groq 金鑰寫進本機 .env.local，以及 Vercel 的 Production / Preview / Development。
# 用法：在 ziju 資料夾執行  powershell -ExecutionPolicy Bypass -File scripts\set-groq-key.ps1
# 金鑰貼在這個視窗，不要貼進聊天。
# 此檔必須存成 UTF-8 with BOM，否則 Windows PowerShell 5.1 會把中文拆壞。

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$key = $env:GROQ_NEW_KEY
if ([string]::IsNullOrWhiteSpace($key)) {
  $key = Read-Host "Paste Groq key (starts with gsk_)"
}
$key = $key.Trim().Trim("'").Trim('"')
if ($key -notmatch "^gsk_") {
  Write-Host "Not a Groq key (must start with gsk_). Cancelled."
  exit 1
}

$envPath = Join-Path (Get-Location) ".env.local"
if (Test-Path $envPath) {
  $lines = Get-Content -LiteralPath $envPath -Encoding UTF8
  $found = $false
  $next = foreach ($line in $lines) {
    if ($line -match "^GROQ_API_KEY=") {
      $found = $true
      "GROQ_API_KEY=$key"
    } else {
      $line
    }
  }
  if (-not $found) { $next += "GROQ_API_KEY=$key" }
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($envPath, [string[]]$next, $utf8NoBom)
  Write-Host "Updated .env.local"
} else {
  Copy-Item ".env.example" $envPath
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($envPath, [string[]]@("GROQ_API_KEY=$key"), $utf8NoBom)
  Write-Host "Created .env.local"
}

Write-Host "Writing Vercel Production and Preview..."
npx vercel env add GROQ_API_KEY production,preview --force --sensitive --value $key --yes --scope wen-sung --project ziju
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Writing Vercel Development..."
npx vercel env add GROQ_API_KEY development --force --value $key --yes --scope wen-sung --project ziju
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Redeploying production..."
npx vercel --prod --yes --scope wen-sung
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Next:"
Write-Host "1. Restart npm run dev if it is running."
Write-Host "2. Open https://console.groq.com/keys and delete the old key."
Write-Host "3. Do not paste the key into chat."
