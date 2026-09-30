param(
    [string]$Ssid = "Yan",
    [string]$HostIp = "192.168.1.23",
    [int]$Port = 17333
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$hostExe = Join-Path $repoRoot "windows-host\target\release\codex-keyboard-windows-host.exe"
if (-not (Test-Path -LiteralPath $hostExe)) {
    throw "Windows Host release EXE was not found: $hostExe"
}

$securePassword = Read-Host "Wi-Fi password for '$Ssid' (input is hidden)" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}
if ([string]::IsNullOrEmpty($password)) {
    throw "Wi-Fi password cannot be empty."
}

try {
    $password | & $hostExe provision-lan --real $Ssid $HostIp $Port
    exit $LASTEXITCODE
}
finally {
    $password = $null
    $securePassword = $null
}
