$ErrorActionPreference = 'SilentlyContinue'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot 'backend'
$runtimeDir = Join-Path $backendDir '.runtime'
$pidFile = Join-Path $runtimeDir 'tunnel.pid'
$logFile = Join-Path $runtimeDir 'tunnel.log'
$urlFile = Join-Path $runtimeDir 'public-url.txt'

if (Test-Path $pidFile) {
  $pidValue = Get-Content $pidFile | Select-Object -First 1
  if ($pidValue) {
    Stop-Process -Id $pidValue -Force
  }
  Remove-Item $pidFile -Force
}

Remove-Item $logFile -Force -ErrorAction SilentlyContinue
Remove-Item $urlFile -Force -ErrorAction SilentlyContinue

Write-Host 'Public sharing tunnel stopped.'
