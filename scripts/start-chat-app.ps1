$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot 'backend'
$runtimeDir = Join-Path $backendDir '.runtime'
$pidFile = Join-Path $runtimeDir 'server.pid'
$port = 8787
$appUrl = 'http://localhost:8787/app/'
$healthUrl = 'http://localhost:8787/health'

function Test-AppHealth {
  try {
    $null = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    return $true
  } catch {
    return $false
  }
}

function Ensure-Dependencies {
  $nodeModules = Join-Path $backendDir 'node_modules'
  if (-not (Test-Path $nodeModules)) {
    Write-Host 'Installing backend dependencies for first run...'
    Push-Location $backendDir
    try {
      npm install
    } finally {
      Pop-Location
    }
  }
}

function Get-PortProcessId {
  try {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
    return $connection.OwningProcess
  } catch {
    return $null
  }
}

function Start-Backend {
  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

  $existingPid = $null
  if (Test-Path $pidFile) {
    $existingPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($existingPid) {
      $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
      if ($existingProcess -and (Test-AppHealth)) {
        return
      }
    }
  }

  $portProcessId = Get-PortProcessId
  if ($portProcessId) {
    if (Test-AppHealth) {
      Set-Content -Path $pidFile -Value $portProcessId
      return
    }
    Stop-Process -Id $portProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
  }

  $command = "Set-Location '$backendDir'; npm run start"
  $process = Start-Process powershell `
    -ArgumentList '-NoProfile', '-WindowStyle', 'Hidden', '-Command', $command `
    -PassThru

  Set-Content -Path $pidFile -Value $process.Id

  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-AppHealth) {
      return
    }
  }

  throw 'Backend failed to start within 15 seconds.'
}

Ensure-Dependencies

if (-not (Test-AppHealth)) {
  Start-Backend
}

Start-Process $appUrl
Write-Host "Open Chat Circle is ready at $appUrl"
