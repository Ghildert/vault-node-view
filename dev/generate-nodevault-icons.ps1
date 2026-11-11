$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$workspace = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $workspace 'apps/desktop'

function New-NodeImage([int]$width, [int]$height, [bool]$wordmark = $false) {
    $bitmap = New-Object Drawing.Bitmap($width, $height)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = 'AntiAlias'
    $graphics.Clear([Drawing.Color]::Transparent)
    $size = if ($wordmark) { $height } else { [Math]::Min($width, $height) }
    $graphics.ScaleTransform($size / 256.0, $size / 256.0)
    $background = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#162638'))
    $pen = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#64d8c4'), 14)
    $pen.StartCap = 'Round'
    $pen.EndCap = 'Round'
    $graphics.FillEllipse($background, 0, 0, 256, 256)
    $graphics.DrawLine($pen, 80, 83, 173, 64)
    $graphics.DrawLine($pen, 80, 100, 143, 185)
    $graphics.DrawLine($pen, 190, 82, 171, 185)
    foreach ($point in @(@(57,82), @(200,55), @(161,211))) {
        $graphics.DrawEllipse($pen, $point[0] - 26, $point[1] - 26, 52, 52)
    }
    $graphics.ResetTransform()
    if ($wordmark) {
        $font = New-Object Drawing.Font('Segoe UI', ([Math]::Max(8, $height * 0.35)), [Drawing.FontStyle]::Bold, [Drawing.GraphicsUnit]::Pixel)
        $brush = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#64d8c4'))
        $graphics.DrawString('NodeVault', $font, $brush, ($height + 6), ($height * 0.23))
        $font.Dispose()
        $brush.Dispose()
    }
    $pen.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    return ,$bitmap
}

function Get-NodePng([int]$size) {
    $bitmap = New-NodeImage $size $size
    $stream = New-Object IO.MemoryStream
    try {
        $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
        return ,$stream.ToArray()
    } finally { $bitmap.Dispose(); $stream.Dispose() }
}

$sizes = @(16,24,32,48,64,128,256)
$images = @($sizes | ForEach-Object { ,(Get-NodePng $_) })
$stream = New-Object IO.MemoryStream
$writer = New-Object IO.BinaryWriter($stream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
        $sizeByte = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
        $writer.Write([byte]$sizeByte); $writer.Write([byte]$sizeByte)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
        $offset += $images[$i].Length
    }
    foreach ($image in $images) { $writer.Write([byte[]]$image) }
    $icon = $stream.ToArray()
} finally { $writer.Dispose(); $stream.Dispose() }

$iconPaths = @('src/images/icon_node.ico','src/images/icon.ico','src/images/icon_beta.ico','resources/icon.ico','resources/icon.beta.ico')
foreach ($relative in $iconPaths) { [IO.File]::WriteAllBytes((Join-Path $desktop $relative), $icon) }

$pngPaths = @('src/images/icon.png','src/images/icon_beta.png','src/images/icon_dev.png','src/images/icon-template.png','src/images/icon-template@2x.png','src/images/icon-highlight.png','src/images/icon-highlight@2x.png','src/images/logo-dark@2x.png','src/images/logo-white@2x.png','src/images/new-experience/new-experience.dark.png','src/images/new-experience/new-experience.light.png')
$pngPaths += @(Get-ChildItem -LiteralPath (Join-Path $desktop 'resources') -Recurse -File -Filter '*.png' | Where-Object { $_.FullName -notmatch 'node_modules' } | ForEach-Object { $_.FullName })
foreach ($relative in $pngPaths) {
    $file = if ([IO.Path]::IsPathRooted($relative)) { $relative } else { Join-Path $desktop $relative }
    if (!(Test-Path -LiteralPath $file)) { continue }
    $old = [Drawing.Image]::FromFile($file)
    $width = $old.Width; $height = $old.Height; $old.Dispose()
    $bitmap = New-NodeImage $width $height ($width -gt $height * 1.8)
    try { $bitmap.Save($file, [Drawing.Imaging.ImageFormat]::Png) } finally { $bitmap.Dispose() }
}
$installer = Join-Path $desktop 'resources/installerSidebar.bmp'
$bitmap = New-NodeImage 164 314
try { $bitmap.Save($installer, [Drawing.Imaging.ImageFormat]::Bmp) } finally { $bitmap.Dispose() }

$png = Get-NodePng 1024
$length = [BitConverter]::GetBytes([int](16 + $png.Length)); [Array]::Reverse($length)
$chunkLength = [BitConverter]::GetBytes([int](8 + $png.Length)); [Array]::Reverse($chunkLength)
$icns = [Text.Encoding]::ASCII.GetBytes('icns') + $length + [Text.Encoding]::ASCII.GetBytes('ic10') + $chunkLength + $png
foreach ($name in @('icon.icns','icon.beta.icns','dmg.icns','dmg.beta.icns')) {
    [IO.File]::WriteAllBytes((Join-Path $desktop ('resources/' + $name)), $icns)
}
$originalSvg = [IO.File]::ReadAllText((Join-Path $desktop 'resources/nodevault-icon.svg'))
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $desktop 'resources') -Filter 'windows_plugin_authenticator_logo_*.svg') {
    [IO.File]::WriteAllText($file.FullName, $originalSvg)
}
Write-Output 'Generated original NodeVault graph icons and wordmarks.'
