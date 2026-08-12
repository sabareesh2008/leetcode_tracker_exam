$ErrorActionPreference = "Stop"

Write-Host "Generating Daily Report..." -ForegroundColor Cyan
python .\report_generator.py --mode daily --dry-run

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Daily HTML report created successfully." -ForegroundColor Green
Write-Host "Open reports\latest_daily_report.html to preview it."
