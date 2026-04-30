# Start Chrome with remote debugging so car-monitor can attach (same TLS stack as your manual browsing).
# Add to .env.local: PLAYWRIGHT_CDP_URL=http://127.0.0.1:9222
$port = 9222
$profile = Join-Path $env:TEMP "gumtree-cdp-profile"
$candidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$chrome = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Write-Error "Google Chrome not found under Program Files. Install Chrome or set PLAYWRIGHT_CDP_URL to your browser's CDP URL."
  exit 1
}
Write-Host "Launching Chrome with --remote-debugging-port=$port"
Write-Host "Profile (separate from daily Chrome): $profile"
Write-Host "Set in .env.local: PLAYWRIGHT_CDP_URL=http://127.0.0.1:$port"
Start-Process $chrome @(
  "--remote-debugging-port=$port",
  "--user-data-dir=$profile",
  "https://www.gumtree.com.au/"
)
