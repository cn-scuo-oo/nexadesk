Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root "build-resources"
New-Item -ItemType Directory -Force $outDir | Out-Null

function ColorFromHex($hex) {
  return [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function New-RoundedRectanglePath($x, $y, $width, $height, $radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-NexaDeskIconBitmap($size) {
  $bmp = [System.Drawing.Bitmap]::new([int]$size, [int]$size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  $pad = [Math]::Max(1, $size * 0.09375)
  $rect = [System.Drawing.RectangleF]::new([float]$pad, [float]$pad, [float]($size - ($pad * 2)), [float]($size - ($pad * 2)))
  $path = New-RoundedRectanglePath $rect.X $rect.Y $rect.Width $rect.Height ($size * 0.203125)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (ColorFromHex "#1C8C7D"), (ColorFromHex "#173A4E"), [float]45)
  $g.FillPath($brush, $path)

  $whitePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, [float][Math]::Max(2, $size * 0.074))
  $whitePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $whitePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $leftTop = [System.Drawing.PointF]::new([float]($size * 0.322), [float]($size * 0.307))
  $leftBottom = [System.Drawing.PointF]::new([float]($size * 0.322), [float]($size * 0.693))
  $rightTop = [System.Drawing.PointF]::new([float]($size * 0.678), [float]($size * 0.307))
  $rightBottom = [System.Drawing.PointF]::new([float]($size * 0.678), [float]($size * 0.693))

  $g.DrawLine($whitePen, $leftBottom, $leftTop)
  $g.DrawLine($whitePen, $leftTop, $rightBottom)
  $g.DrawLine($whitePen, $rightBottom, $rightTop)

  if ($size -ge 32) {
    $mint = [System.Drawing.SolidBrush]::new((ColorFromHex "#B6F5D8"))
    $inner = [System.Drawing.SolidBrush]::new((ColorFromHex "#1E4D5A"))
    $nodePen = [System.Drawing.Pen]::new([System.Drawing.Color]::White, [float][Math]::Max(2, $size * 0.023))
    $mintPen = [System.Drawing.Pen]::new((ColorFromHex "#B6F5D8"), [float][Math]::Max(2, $size * 0.021))

    foreach ($point in @($leftTop, $leftBottom, $rightTop, $rightBottom)) {
      $r = $size * 0.047
      $g.FillEllipse($mint, $point.X - $r, $point.Y - $r, $r * 2, $r * 2)
      $g.DrawEllipse($nodePen, $point.X - $r, $point.Y - $r, $r * 2, $r * 2)
    }

    $center = [System.Drawing.PointF]::new([float]($size * 0.5), [float]($size * 0.5))
    $cr = $size * 0.037
    $g.FillEllipse($inner, $center.X - $cr, $center.Y - $cr, $cr * 2, $cr * 2)
    $g.DrawEllipse($mintPen, $center.X - $cr, $center.Y - $cr, $cr * 2, $cr * 2)
  }

  $g.Dispose()
  return $bmp
}

function Save-IconPngsAndIco {
  $images = @()
  foreach ($size in @(16, 24, 32, 48, 64, 128, 256)) {
    $bmp = New-NexaDeskIconBitmap $size
    $pngPath = Join-Path $outDir "icon-$size.png"
    $bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $images += [pscustomobject]@{
      Size = $size
      Bytes = [System.IO.File]::ReadAllBytes($pngPath)
    }
  }

  $icoPath = Join-Path $outDir "icon.ico"
  $fs = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
  $writer = [System.IO.BinaryWriter]::new($fs)
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$images.Count)
  $offset = 6 + (16 * $images.Count)

  foreach ($image in $images) {
    $dimension = if ($image.Size -eq 256) { 0 } else { $image.Size }
    $writer.Write([byte]$dimension)
    $writer.Write([byte]$dimension)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$image.Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $image.Bytes.Length
  }

  foreach ($image in $images) {
    $writer.Write($image.Bytes)
  }

  $writer.Dispose()
  $fs.Dispose()
}

function Save-InstallerHeader {
  $bmp = [System.Drawing.Bitmap]::new(150, 57, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear((ColorFromHex "#F4FAF7"))
  $icon = New-NexaDeskIconBitmap 42
  $g.DrawImage($icon, 8, 8, 42, 42)

  $titleFont = [System.Drawing.Font]::new("Segoe UI", [float]13, [System.Drawing.FontStyle]::Bold)
  $subFont = [System.Drawing.Font]::new("Segoe UI", [float]7.5, [System.Drawing.FontStyle]::Regular)
  $titleBrush = [System.Drawing.SolidBrush]::new((ColorFromHex "#173A4E"))
  $subBrush = [System.Drawing.SolidBrush]::new((ColorFromHex "#4F665E"))
  $g.DrawString("NexaDesk", $titleFont, $titleBrush, 57, 11)
  $g.DrawString("Agent Workbench", $subFont, $subBrush, 58, 33)

  $icon.Dispose()
  $g.Dispose()
  $bmp.Save((Join-Path $outDir "installer-header.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
}

function Save-InstallerSidebar {
  $bmp = [System.Drawing.Bitmap]::new(164, 314, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $rect = [System.Drawing.RectangleF]::new(0, 0, 164, 314)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rect, (ColorFromHex "#173A4E"), (ColorFromHex "#1C8C7D"), [float]45)
  $g.FillRectangle($brush, $rect)

  $icon = New-NexaDeskIconBitmap 88
  $g.DrawImage($icon, 38, 38, 88, 88)
  $titleFont = [System.Drawing.Font]::new("Segoe UI", [float]16, [System.Drawing.FontStyle]::Bold)
  $subFont = [System.Drawing.Font]::new("Segoe UI", [float]8.5, [System.Drawing.FontStyle]::Regular)
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $muted = [System.Drawing.SolidBrush]::new((ColorFromHex "#B6F5D8"))
  $g.DrawString("Nexa", $titleFont, $white, 29, 153)
  $g.DrawString("Desk", $titleFont, $white, 82, 153)
  $g.DrawString("Multi-agent", $subFont, $muted, 38, 195)
  $g.DrawString("desktop workbench", $subFont, $muted, 38, 211)

  $icon.Dispose()
  $g.Dispose()
  $bmp.Save((Join-Path $outDir "installer-sidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $bmp.Dispose()
}

Save-IconPngsAndIco
Save-InstallerHeader
Save-InstallerSidebar

Write-Host "Generated NexaDesk brand assets in $outDir"

