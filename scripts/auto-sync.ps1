param(
  [int]$IntervalSeconds = 30
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

while ($true) {
  try {
    $status = git status --porcelain
    if ($status) {
      git add -A | Out-Null
      $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
      git commit -m "Auto-sync $stamp" | Out-Null
      git pull --rebase | Out-Null
      git push | Out-Null
    }
  } catch {
    # swallow errors to keep the watcher alive
  }
  Start-Sleep -Seconds $IntervalSeconds
}
