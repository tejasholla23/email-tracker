[void][System.Reflection.Assembly]::LoadWithPartialName('System.Drawing')

# Use the BLACK-CIRCLE logo for favicons (visible on light browser tabs)
$srcPath = "C:\Users\Admin\.gemini\antigravity-ide\brain\279ae157-6860-45ca-9d81-8c23ca72689c\media__1783089389574.png"
$appDir = "c:\Users\Admin\email-tracker\frontend\app"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found at $srcPath"
    Exit 1
}

function Resize-Bitmap($srcBmp, $width, $height) {
    $destBmp = New-Object System.Drawing.Bitmap($width, $height)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcBmp, 0, 0, $width, $height)
    $g.Dispose()
    return $destBmp
}

$srcBmp = [System.Drawing.Bitmap]::FromFile($srcPath)

Write-Host "Generating icon.png (512x512) from black-circle logo..."
$iconBmp = Resize-Bitmap $srcBmp 512 512
$iconBmp.Save((Join-Path $appDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$iconBmp.Dispose()

Write-Host "Generating apple-icon.png (180x180) from black-circle logo..."
$appleBmp = Resize-Bitmap $srcBmp 180 180
$appleBmp.Save((Join-Path $appDir "apple-icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$appleBmp.Dispose()

Write-Host "Generating favicon.ico (32x32) from black-circle logo..."
$favBmp = Resize-Bitmap $srcBmp 32 32
$hIcon = $favBmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream((Join-Path $appDir "favicon.ico"), [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$favBmp.Dispose()

$srcBmp.Dispose()
Write-Host "All favicon assets regenerated from black-circle logo."
