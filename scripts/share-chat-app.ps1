$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot 'backend'
$runtimeDir = Join-Path $backendDir '.runtime'
$pidFile = Join-Path $runtimeDir 'tunnel.pid'
$logFile = Join-Path $runtimeDir 'tunnel.log'
$urlFile = Join-Path $runtimeDir 'public-url.txt'
$localUrl = 'http://localhost:8787'
$publicPattern = 'https://[a-z0-9-]+\.trycloudflare\.com'

function Find-CloudflaredPath {
  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $exactCandidates = @(
    (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\cloudflared\cloudflared.exe')
  )

  foreach ($candidate in $exactCandidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  $wingetRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path $wingetRoot) {
    $match = Get-ChildItem -Path $wingetRoot -Recurse -Filter cloudflared.exe -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($match) {
      return $match.FullName
    }
  }

  return $null
}

function Ensure-Cloudflared {
  $cloudflaredPath = Find-CloudflaredPath
  if ($cloudflaredPath) {
    return $cloudflaredPath
  }

  Write-Host 'Installing cloudflared for internet sharing...'
  winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements

  $cloudflaredPath = Find-CloudflaredPath
  if (-not $cloudflaredPath) {
    throw 'cloudflared installation failed.'
  }

  return $cloudflaredPath
}

function Get-TunnelProcessId {
  if (Test-Path $pidFile) {
    return Get-Content $pidFile | Select-Object -First 1
  }
  return $null
}

function Read-TunnelUrl {
  if (-not (Test-Path $logFile)) {
    return $null
  }

  $match = Select-String -Path $logFile -Pattern $publicPattern -AllMatches | Select-Object -Last 1
  if (-not $match) {
    return $null
  }

  return $match.Matches[-1].Value
}

function Ensure-LocalApp {
  powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-chat-app.ps1') | Out-Null
}

function Start-Tunnel {
  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
  $cloudflaredPath = Ensure-Cloudflared

  $existingPid = Get-TunnelProcessId
  if ($existingPid) {
    $existingProcess = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
    if ($existingProcess) {
      $existingUrl = Read-TunnelUrl
      if ($existingUrl) {
        return $existingUrl
      }
      Stop-Process -Id $existingPid -Force -ErrorAction SilentlyContinue
    }
  }

  Remove-Item $logFile -Force -ErrorAction SilentlyContinue
  Remove-Item $urlFile -Force -ErrorAction SilentlyContinue

  $process = Start-Process $cloudflaredPath `
    -ArgumentList 'tunnel', '--url', $localUrl, '--no-autoupdate', '--loglevel', 'info', '--logfile', $logFile `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -Path $pidFile -Value $process.Id

  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Milliseconds 500
    $url = Read-TunnelUrl
    if ($url) {
      Set-Content -Path $urlFile -Value $url
      try {
        Set-Clipboard -Value $url
      } catch {
      }
      return $url
    }
  }

  throw 'Public sharing link was not created in time.'
}

Ensure-LocalApp
$publicUrl = Start-Tunnel

Write-Host ''
Write-Host 'Your public chat link is ready:'
Write-Host $publicUrl
Write-Host ''
Write-Host 'The link has also been copied to your clipboard.'

Start-Process $publicUrl
