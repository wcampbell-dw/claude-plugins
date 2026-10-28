# Runs the Azure CLI's own Python directly instead of az.cmd, so cmd.exe never re-parses
# & | < > ^ in the arguments. Put this file in a folder that comes before the Azure CLI's
# bin folder on PATH, such as ~/.local/bin.
$python = @(
    "$env:LOCALAPPDATA\azure-cli\python.exe"
    "$env:ProgramFiles\Microsoft SDKs\Azure\CLI2\python.exe"
    "${env:ProgramFiles(x86)}\Microsoft SDKs\Azure\CLI2\python.exe"
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $python) {
    Write-Error "az shim: no Azure CLI python.exe found"
    exit 1
}
$env:AZ_INSTALLER = if (Test-Path -LiteralPath "$env:LOCALAPPDATA\azure-cli\python.exe") { 'ZIP' } else { 'MSI' }
& $python -IBm azure.cli @args
exit $LASTEXITCODE
