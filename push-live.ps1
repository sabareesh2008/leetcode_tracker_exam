$ErrorActionPreference = "Stop"

git status
git add .
git commit -m "Integrate daily coding test with leaderboard analytics"
git push

Write-Host ""
Write-Host "Git push completed." -ForegroundColor Green
Write-Host "If your Java runner is linked to this branch on your container host, the push can trigger its auto-deploy."
