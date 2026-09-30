param(
    [string]$WorkDirectory = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.."))
$hostExe = Join-Path $repoRoot "windows-host\target\release\codex-keyboard-windows-host.exe"
if (-not (Test-Path -LiteralPath $hostExe)) {
    throw "Windows Host release EXE was not found: $hostExe"
}

if ([string]::IsNullOrWhiteSpace($WorkDirectory)) {
    $WorkDirectory = $repoRoot.Path
}
if (-not (Test-Path -LiteralPath $WorkDirectory -PathType Container)) {
    throw "Work directory does not exist: $WorkDirectory"
}

$secureKey = Read-Host "DashScope API Key (input is hidden)" -AsSecureString
$keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
}
if ([string]::IsNullOrWhiteSpace($apiKey)) {
    throw "API Key cannot be empty."
}

$old = @{
    EASY_INPUT_V3_ENABLED = $env:EASY_INPUT_V3_ENABLED
    EASY_CODEX_DASHSCOPE_ASR_ENABLED = $env:EASY_CODEX_DASHSCOPE_ASR_ENABLED
    EASY_CODEX_DASHSCOPE_TTS_ENABLED = $env:EASY_CODEX_DASHSCOPE_TTS_ENABLED
    DASHSCOPE_API_KEY = $env:DASHSCOPE_API_KEY
    EASY_CODEX_WORKDIR = $env:EASY_CODEX_WORKDIR
}

try {
    $env:EASY_INPUT_V3_ENABLED = "true"
    $env:EASY_CODEX_DASHSCOPE_ASR_ENABLED = "true"
    $env:EASY_CODEX_DASHSCOPE_TTS_ENABLED = "true"
    $env:DASHSCOPE_API_KEY = $apiKey
    $env:EASY_CODEX_WORKDIR = $WorkDirectory
    & $hostExe v3-listen --real
    exit $LASTEXITCODE
}
finally {
    foreach ($name in $old.Keys) {
        Set-Item -Path "Env:$name" -Value $old[$name]
    }
    $apiKey = $null
    $secureKey = $null
}
