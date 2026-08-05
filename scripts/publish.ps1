[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateNotNullOrEmpty()]
  [string]$Message,
  [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$pluginRoot = Join-Path $repoRoot 'plugins\gitee-codex-plugin'

Push-Location $pluginRoot
try {
  if (-not $SkipTests) {
    npm ci
    npm test
  }
} finally {
  Pop-Location
}

Push-Location $repoRoot
try {
  git diff --check
  git add --all
  if (git diff --cached --quiet) {
    throw 'No changes are staged for publication.'
  }

  git commit -m $Message
  $branch = (git branch --show-current).Trim()
  if ($branch -ne 'main') {
    throw "Publishing is only allowed from main, found '$branch'."
  }

  $commit = (git rev-parse HEAD).Trim()
  foreach ($remote in @('gitee', 'github')) {
    git push $remote "${branch}:${branch}"
    $remoteHead = (git ls-remote --heads $remote "refs/heads/$branch").Split()[0]
    if ($remoteHead -ne $commit) {
      throw "Remote '$remote' does not point to the published commit."
    }
  }
} finally {
  Pop-Location
}
