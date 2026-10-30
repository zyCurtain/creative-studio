param([switch]$Build, [switch]$Simulation)
$ErrorActionPreference = 'Stop'
# A running terminal may predate a Windows environment-variable change.
# Values are passed only in the child process environment, never printed or saved.
if ($Simulation) { $env:DASHSCOPE_API_KEY = '' }
elseif ([string]::IsNullOrWhiteSpace($env:DASHSCOPE_API_KEY)) {
  foreach ($scope in @('User', 'Machine')) {
    $candidate = [Environment]::GetEnvironmentVariable('DASHSCOPE_API_KEY', $scope)
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
      $env:DASHSCOPE_API_KEY = $candidate.Trim()
      break
    }
  }
}
Push-Location $PSScriptRoot
try {
  if ($Build) { docker compose build; if ($LASTEXITCODE -ne 0) { throw 'Build failed' } }
  docker compose up -d --wait --wait-timeout 180
  if ($LASTEXITCODE -ne 0) { throw 'Startup failed; check sanitized application logs.' }
} finally { Pop-Location }
