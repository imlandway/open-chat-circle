$ErrorActionPreference = 'SilentlyContinue'

$projectRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $projectRoot 'backend'
$pidFile = Join-Path (Join-Path $backendDir '.runtime') 'server.pid'
$port = 8787

function Get-PortProcessId {
  try {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
    return $connection.OwningProcess
  } catch {
    return $null
  }
}

if (Test-Path $pidFile) {
  $pidValue = Get-Content $pidFile | Select-Object -First 1
  if ($pidValue) {
    Stop-Process -Id $pidValue -Force
  }
  Remove-Item $pidFile -Force
  Write-Host 'Open Chat Circle backend stopped.'
} else {
  $pidValue = Get-PortProcessId
  if ($pidValue) {
    Stop-Process -Id $pidValue -Force
    Write-Host 'Open Chat Circle backend stopped.'
  } else {
    Write-Host 'No running backend found.'
  }
}
