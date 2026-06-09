param(
  [int]$Port = 4173
)

Write-Host "Starting HK Dashboard preview on 0.0.0.0:$Port"
npm run build
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run preview -- --port $Port"

Write-Host "If Tailscale is installed, run this in another terminal:"
Write-Host "tailscale serve --bg http://127.0.0.1:$Port"
