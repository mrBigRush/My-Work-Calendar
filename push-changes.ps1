#!/usr/bin/env powershell
# Quick commit and push script for My-Work-Calendar project

param(
    [string]$Message = "Update code"
)

$gitPath = "C:\Program Files\Git\bin\git.exe"
$projectPath = "d:\Soft\My-Work-Calendar-main"

Set-Location $projectPath

Write-Host "📦 Staging changes..." -ForegroundColor Cyan
& $gitPath add .

Write-Host "📝 Committing with message: '$Message'" -ForegroundColor Cyan
& $gitPath commit -m "$Message"

if ($LASTEXITCODE -eq 0) {
    Write-Host "🚀 Pushing to GitHub..." -ForegroundColor Cyan
    & $gitPath push origin main
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Changes successfully pushed to GitHub!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Recent commits:" -ForegroundColor Yellow
        & $gitPath log --oneline -3
    } else {
        Write-Host "❌ Push failed. Check your connection and try again." -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ Nothing to commit" -ForegroundColor Yellow
}
