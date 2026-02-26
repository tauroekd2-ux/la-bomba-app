# Mata el proceso que usa el puerto 3031 y arranca el proxy de nuevo
$pid = Get-NetTCPConnection -LocalPort 3031 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1
if ($pid) {
  Write-Host "Cerrando proceso en puerto 3031 (PID $pid)..."
  Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}
Write-Host "Arrancando proxy..."
Set-Location $PSScriptRoot
node server-proxy.js
