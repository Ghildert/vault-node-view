param(
    [switch]$Development,
    [switch]$BuildOnly,
    [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $workspace 'apps/desktop'
$outputDirectory = if ($Development) { 'build-dev' } else { 'build-nodevault' }
$buildScript = if ($Development) { 'build:dev' } else { 'build' }
$startScript = if ($Development) { 'start:dev' } else { 'start' }
$profile = if ($Development) { 'NodeVault-Bitwarden-Dev' } else { 'NodeVault-Bitwarden-Test' }
$previousAppData = $env:BITWARDEN_APPDATA_DIR
$previousSocket = $env:BITWARDEN_IPC_SOCKET_DIR
$previousOutput = $env:OUTPUT_PATH

Push-Location $desktop
try {
    $missingFiles = @('package.json', 'main.js', 'index.html', 'preload.js') | Where-Object {
        -not (Test-Path -LiteralPath (Join-Path $outputDirectory $_) -PathType Leaf)
    }
    if ($BuildOnly -or $Rebuild -or $missingFiles) {
        $env:OUTPUT_PATH = $outputDirectory
        npm.cmd run $buildScript
        if ($LASTEXITCODE -ne 0) { throw "Desktop build exited with code $LASTEXITCODE." }
    }
    if ($BuildOnly) { return }

    $env:BITWARDEN_APPDATA_DIR = Join-Path $env:LOCALAPPDATA $profile
    $env:BITWARDEN_IPC_SOCKET_DIR = $env:BITWARDEN_APPDATA_DIR
    New-Item -ItemType Directory -Force -Path $env:BITWARDEN_APPDATA_DIR | Out-Null
    npm.cmd run $startScript
    if ($LASTEXITCODE -ne 0) { throw "Bitwarden Desktop exited with code $LASTEXITCODE." }
} finally {
    Pop-Location
    $env:BITWARDEN_APPDATA_DIR = $previousAppData
    $env:BITWARDEN_IPC_SOCKET_DIR = $previousSocket
    $env:OUTPUT_PATH = $previousOutput
}
