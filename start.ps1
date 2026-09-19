$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
Start-Process -FilePath "python" -ArgumentList "-m","http.server","4175" -WindowStyle Hidden
Start-Sleep -Seconds 1
Start-Process "http://localhost:4175"
Write-Host "GreenLedger is on http://localhost:4175"
