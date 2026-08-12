$ErrorActionPreference = "Stop"

Write-Host "Generating Weekly Report..." -ForegroundColor Cyan
python .\report_generator.py --mode weekly --dry-run

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Weekly HTML report created successfully." -ForegroundColor Green
Write-Host "Open reports\latest_weekly_report.html to preview it."
