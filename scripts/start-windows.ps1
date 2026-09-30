param(
    [int]$Port = 17345,
    [switch]$SkipDesktop,
    [switch]$TemporaryData
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
$projectRoot = (Resolve-Path (Join-Path $repoRoot ".."))
$hostManifest = Join-Path $projectRoot "windows-host\Cargo.toml"
$hostAddress = "127.0.0.1:$Port"

if (-not (Test-Path $hostManifest)) {
    throw "找不到 Windows Host：$hostManifest。请确认脚本位于 codex-task-radio\Codex_Keyboard\scripts。"
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "找不到 cargo。请先安装 Rust，并重新打开 PowerShell。"
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    throw "端口 $Port 已被占用。请换一个端口，例如：.\scripts\start-windows.ps1 -Port 17346"
}

$env:EASY_CODEX_HOST_ADDR = $hostAddress

if ($TemporaryData) {
    $runtimeRoot = Join-Path $repoRoot "runtime\windows-dev"
    $localAppData = Join-Path $runtimeRoot "localappdata"
    New-Item -ItemType Directory -Force $localAppData | Out-Null
    $env:LOCALAPPDATA = $localAppData
    Write-Host "使用临时 Host 数据目录：$localAppData" -ForegroundColor DarkGray
}

$hostProcess = Start-Process `
    -FilePath "cargo" `
    -ArgumentList @("run", "--manifest-path", $hostManifest, "--", "control-server", $hostAddress) `
    -WorkingDirectory $repoRoot `
    -NoNewWindow `
    -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $ready = $client.ConnectAsync("127.0.0.1", $Port).Wait(250)
    }
    finally {
        $client.Dispose()
    }
    if ($ready) {
        break
    }
}

if (-not $ready) {
    throw "Host 未能在 20 秒内监听 $hostAddress。请检查上方 Host 输出。"
}

Write-Host "Windows Host 已启动：$hostAddress（PID $($hostProcess.Id)）" -ForegroundColor Green

if (-not $SkipDesktop) {
    $desktopManifest = Join-Path $repoRoot "app\desktop\src-tauri\Cargo.toml"
    $desktopProcess = Start-Process `
        -FilePath "cargo" `
        -ArgumentList @("run", "--manifest-path", $desktopManifest) `
        -WorkingDirectory $repoRoot `
        -NoNewWindow `
        -PassThru
    Write-Host "Windows 桌面端正在启动（PID $($desktopProcess.Id)）。" -ForegroundColor Green
}

Write-Host "提示：当前开发阶段不会连接开发板、调用真实 ASR 或执行 Codex。" -ForegroundColor Yellow
