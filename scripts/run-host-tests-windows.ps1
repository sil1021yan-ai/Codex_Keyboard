param(
    [string]$VcpkgRoot = "",
    [int]$Parallel = 4
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".."))
$projectRoot = (Resolve-Path (Join-Path $repoRoot ".."))
$sourceDir = Join-Path $repoRoot "firmware\host_test"
$buildDir = Join-Path $repoRoot "firmware\build-host-test-windows"

if ([string]::IsNullOrWhiteSpace($VcpkgRoot)) {
    $VcpkgRoot = Join-Path $projectRoot ".tools\vcpkg"
}
$VcpkgRoot = (Resolve-Path $VcpkgRoot).Path

$toolchainFile = Join-Path $VcpkgRoot "scripts\buildsystems\vcpkg.cmake"
$opensslBin = Join-Path $VcpkgRoot "installed\x64-windows\bin"
$cmake = Get-ChildItem "C:\Espressif\tools\cmake\*\bin\cmake.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName |
    Select-Object -Last 1
$ninja = Get-ChildItem "C:\Espressif\tools\ninja\*\ninja.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName |
    Select-Object -Last 1
$ctest = if ($cmake) { Join-Path $cmake.DirectoryName "ctest.exe" } else { $null }
$vcvars = Get-ChildItem "C:\Program Files (x86)\Microsoft Visual Studio" -Recurse -Filter "vcvars64.bat" -ErrorAction SilentlyContinue |
    Sort-Object FullName |
    Select-Object -Last 1

foreach ($required in @(
        @{ Name = "vcpkg 工具链"; Path = $toolchainFile },
        @{ Name = "OpenSSL 运行库"; Path = $opensslBin },
        @{ Name = "CMake"; Path = if ($cmake) { $cmake.FullName } else { "" } },
        @{ Name = "Ninja"; Path = if ($ninja) { $ninja.FullName } else { "" } },
        @{ Name = "CTest"; Path = $ctest },
        @{ Name = "Visual Studio C++ 环境"; Path = if ($vcvars) { $vcvars.FullName } else { "" } }
    )) {
    if ([string]::IsNullOrWhiteSpace($required.Path) -or -not (Test-Path $required.Path)) {
        throw "找不到 $($required.Name)。请先按项目说明安装 Windows 固件测试环境。"
    }
}

function Invoke-DeveloperCommand([string]$Command) {
    & cmd.exe /d /s /c $Command
    if ($LASTEXITCODE -ne 0) {
        throw "命令执行失败，退出码：$LASTEXITCODE"
    }
}

$configure = 'call "' + $vcvars.FullName + '" && "' + $cmake.FullName +
    '" -S "' + $sourceDir + '" -B "' + $buildDir +
    '" -G Ninja -DCMAKE_MAKE_PROGRAM="' + $ninja.FullName +
    '" -DCMAKE_BUILD_TYPE=Debug -DCMAKE_TOOLCHAIN_FILE="' + $toolchainFile +
    '" -DVCPKG_TARGET_TRIPLET=x64-windows'

Write-Host "[1/3] 配置 Windows 固件离线测试..." -ForegroundColor Cyan
Invoke-DeveloperCommand $configure

$build = 'call "' + $vcvars.FullName + '" && "' + $cmake.FullName +
    '" --build "' + $buildDir + '" --parallel ' + $Parallel

Write-Host "[2/3] 编译测试..." -ForegroundColor Cyan
Invoke-DeveloperCommand $build

$test = 'call "' + $vcvars.FullName + '" && set "PATH=' + $opensslBin +
    ';%PATH%" && "' + $ctest + '" --test-dir "' + $buildDir +
    '" --timeout 30 --output-on-failure'

Write-Host "[3/3] 运行测试..." -ForegroundColor Cyan
Invoke-DeveloperCommand $test

Write-Host "Windows 固件离线测试全部通过。当前没有连接或操作开发板。" -ForegroundColor Green
