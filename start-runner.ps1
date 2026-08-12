$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot ".env.runner"

if (-not (Test-Path $envFile)) {
    Write-Host "Missing .env.runner" -ForegroundColor Red
    Write-Host "Copy .env.runner.example to .env.runner and fill the values."
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim()
        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

Push-Location (Join-Path $PSScriptRoot "code-runner")

docker build -t ece-java-runner .

docker rm -f ece-java-runner 2>$null | Out-Null

docker run -d `
  --name ece-java-runner `
  --restart unless-stopped `
  -p 8080:8080 `
  --memory="768m" `
  --cpus="1.5" `
  --pids-limit="128" `
  -e SUPABASE_URL="$env:SUPABASE_URL" `
  -e SUPABASE_SERVICE_ROLE_KEY="$env:SUPABASE_SERVICE_ROLE_KEY" `
  -e ALLOWED_ORIGINS="$env:ALLOWED_ORIGINS" `
  ece-java-runner

Pop-Location

Start-Sleep -Seconds 2
Write-Host "Runner health:" -ForegroundColor Green
Invoke-RestMethod http://localhost:8080/health | ConvertTo-Json
