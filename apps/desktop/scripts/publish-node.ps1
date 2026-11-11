$ErrorActionPreference = 'Stop'

$package = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../dist-node/Bitwarden Node.exe')).Path
$directory = '\\DESKTOP-18DF4QI\Builds'
if (!(Test-Path -LiteralPath $directory -PathType Container)) {
    [void][IO.Directory]::CreateDirectory($directory)
}
$destination = Join-Path $directory 'Bitwarden Node.exe'
$stagedFile = Join-Path $directory ('.BitwardenNode-' + [Guid]::NewGuid().ToString('N') + '.tmp')
try {
    [IO.File]::Copy($package, $stagedFile)
    if ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $stagedFile -Algorithm SHA256).Hash) {
        throw 'Published build verification failed: SHA256 hashes differ.'
    }
    if ([IO.File]::Exists($destination)) {
        [IO.File]::Replace($stagedFile, $destination, [NullString]::Value)
    } else {
        [IO.File]::Move($stagedFile, $destination)
    }
} finally {
    [IO.File]::Delete($stagedFile)
}
Write-Output "Published $destination"
