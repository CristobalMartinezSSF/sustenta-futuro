<#
    make-delivery-zip.ps1 — Build a SAFE delivery ZIP of the project for handoff.

    Uses `git archive`, so the ZIP contains ONLY committed files. This excludes
    by construction: .env / .env.local (secrets), .git/ (which embeds the GitHub
    PAT), node_modules/, .next/, __pycache__/ and any untracked scratch files.

    Usage (from the repo root):
        ./scripts/make-delivery-zip.ps1
        ./scripts/make-delivery-zip.ps1 -Out C:\tmp\sf.zip

    Verify the result does not contain secrets before sending:
        Expand-Archive .\sustenta-futuro-delivery.zip -DestinationPath .\_zipcheck
        Select-String -Path .\_zipcheck\* -Pattern 'sb_secret|re_|github_pat|SUPABASE_SERVICE' -Recurse
#>
param(
    [string]$Out = "sustenta-futuro-delivery.zip"
)

$ErrorActionPreference = "Stop"

# Ensure we run at the repo root.
$repoRoot = (git rev-parse --show-toplevel).Trim()
Set-Location $repoRoot

$sha = (git rev-parse --short HEAD).Trim()
git archive --format=zip --output $Out HEAD

$size = [math]::Round((Get-Item $Out).Length / 1MB, 2)
Write-Host "OK: wrote $Out from commit $sha ($size MB)."
Write-Host "Contains only committed files — no .env, no .git, no node_modules."
Write-Host "Tip: unzip and grep for 'sb_secret|re_|github_pat' to double-check before sending."
