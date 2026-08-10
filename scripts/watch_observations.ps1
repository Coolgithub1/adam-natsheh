param([int]$IntervalSeconds = 30)
$root = Split-Path -Parent $PSScriptRoot
while ($true) {
  python "$PSScriptRoot\build_observations.py" | Out-Null
  Start-Sleep -Seconds $IntervalSeconds
}
