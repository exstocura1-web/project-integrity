#Requires -Version 5.1
<#
.SYNOPSIS
  Replace Google AI Studio default branding in a Project Integrity repo.

.DESCRIPTION
  Pass -RepoRoot to your cloned Vercel / AI Studio export folder.
  Review diff before commit; backup first.

.PARAMETER RepoRoot
  Absolute path to the project root (contains index.html or src/).

.EXAMPLE
  .\apply-branding.ps1 -RepoRoot "C:\path\to\your\project-integrity-repo"
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $RepoRoot
)

function Write-Step { param([string]$m) Write-Host "[*] $m" -ForegroundColor Cyan }
function Write-Ok { param([string]$m) Write-Host "[ok] $m" -ForegroundColor Green }
function Write-Fail { param([string]$m) Write-Host "[!!] $m" -ForegroundColor Red }

$root = Resolve-Path -LiteralPath $RepoRoot -ErrorAction SilentlyContinue
if (-not $root) {
  Write-Fail "RepoRoot not found: $RepoRoot"
  exit 1
}

Write-Step "Scanning under $root ..."

$tm = [char]0x2122
$titleNew = "Project Integrity$tm | Exsto Cura Consilium"
$patterns = @(
  @{ Old = "My Google AI Studio App"; New = $titleNew },
  @{ Old = "My Google AI Studio app"; New = $titleNew }
)

$ext = @("*.html", "*.tsx", "*.ts", "*.jsx", "*.js", "*.json", "*.md")
$files = @()
foreach ($e in $ext) {
  $files += Get-ChildItem -LiteralPath $root -Recurse -File -Filter $e -ErrorAction SilentlyContinue |
    Where-Object {
      $_.FullName -notmatch "[\\/]node_modules[\\/]" -and
      $_.FullName -notmatch "[\\/]\.next[\\/]" -and
      $_.FullName -notmatch "[\\/]dist[\\/]" -and
      $_.FullName -notmatch "[\\/]build[\\/]" -and
      $_.FullName -notmatch "[\\/]drop-into-your-build[\\/]"
    }
}

$utf8 = New-Object System.Text.UTF8Encoding($false)
$changed = 0
foreach ($f in $files) {
  $raw = [System.IO.File]::ReadAllText($f.FullName, $utf8)
  $next = $raw
  foreach ($p in $patterns) {
    if ($next.Contains($p.Old)) {
      $next = $next.Replace($p.Old, $p.New)
    }
  }
  if ($next -ne $raw) {
    [System.IO.File]::WriteAllText($f.FullName, $next, $utf8)
    Write-Ok "Updated: $($f.FullName)"
    $changed++
  }
}

if ($changed -eq 0) {
  Write-Step "No matching strings found. Grep manually for: Google AI Studio, gen-lang, AI Studio"
} else {
  Write-Ok "Files modified: $changed - merge hero/footer from drop-into-your-build\ manually if needed."
}
