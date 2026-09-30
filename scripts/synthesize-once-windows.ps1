param(
    [ValidateRange(1, 4)][int]$Slot = 1,
    [switch]$CheckOnly,
    [ValidateRange(0, 2147483647)][int]$ExpectedGeneration = 0,
    [string]$ExpectedTaskId = ''
)

$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$hostExe = Join-Path $projectRoot 'windows-host\target\release\codex-keyboard-windows-host.exe'
if (-not (Test-Path -LiteralPath $hostExe -PathType Leaf)) {
    throw 'Windows Host was not found. Do not enter an API Key here.'
}
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    throw 'Windows user data path is unavailable.'
}

$dataRoot = Join-Path $env:LOCALAPPDATA 'EasyCodexInput'
if (-not (Test-Path -LiteralPath (Join-Path $dataRoot 'state.sqlite3') -PathType Leaf)) {
    throw 'This Windows user has no Codex Keyboard task database. Nothing was sent.'
}

# Never show the task UUID or spoken text. Read the requested slot first.
$summaryLines = @(& $hostExe summary-status 2>&1)
if ($LASTEXITCODE -ne 0) {
    throw 'Could not read the current summary. Nothing was sent.'
}
$slotLines = @($summaryLines | Where-Object { [string]$_ -match "^slot=$Slot " })
if ($slotLines.Count -ne 1) {
    throw "Expected exactly one unread summary for slot $Slot. Nothing was sent."
}
$summary = [regex]::Match([string]$slotLines[0], "^slot=$Slot generation=(\d+) audio_state=(pending_tts|ready) task_id=([0-9a-fA-F-]{36})(?:\s|$)")
if (-not $summary.Success) {
    throw "Slot $Slot is not waiting for speech generation. Nothing was sent."
}
$generation = $summary.Groups[1].Value
$audioState = $summary.Groups[2].Value
if ($ExpectedGeneration -gt 0 -and [int]$generation -ne $ExpectedGeneration) {
    throw 'Summary generation changed. Nothing was sent.'
}
if ($ExpectedTaskId -ne '' -and $summary.Groups[3].Value -ne $ExpectedTaskId) {
    throw 'Summary target task changed. Nothing was sent.'
}
Write-Host "Slot ${Slot}: generation=$generation, audio_state=$audioState"

if ($audioState -eq 'ready') {
    Write-Host 'Audio already exists. No cloud request will be made.'
    if (-not $CheckOnly) {
        & $hostExe cache-verify $Slot
        if ($LASTEXITCODE -ne 0) { throw 'Existing audio failed local verification.' }
    }
    return
}

$marker = Join-Path $dataRoot "run\tts-once-slot$Slot-generation-$generation.attempt"
if (Test-Path -LiteralPath $marker) {
    throw 'This summary already had one TTS attempt. Do not run it again; send the first error to AI.'
}
if ($CheckOnly) {
    Write-Host 'Check only: one TTS attempt is available; no cloud request was made.'
    return
}

# CreateNew is atomic. The marker remains after failure to prevent accidental
# duplicate billing when the cloud accepted a request but the response failed.
$runDirectory = Join-Path $dataRoot 'run'
[void](New-Item -ItemType Directory -Path $runDirectory -Force)
$markerFile = [System.IO.File]::Open($marker, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
$markerFile.Dispose()

$env:EASY_CODEX_DASHSCOPE_TTS_ENABLED = 'true'
Write-Host 'Sending one speech-generation request using the saved API Key...'
& $hostExe synthesize-summary --real $Slot
if ($LASTEXITCODE -ne 0) {
    throw 'Speech generation did not finish. Do not rerun this script; share the error above.'
}

& $hostExe cache-verify $Slot
if ($LASTEXITCODE -ne 0) {
    throw 'Audio was generated but local verification failed. Do not rerun the cloud request.'
}
Write-Host "Audio is ready and verified. You can test S$($Slot + 4) once."
