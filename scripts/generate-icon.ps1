Add-Type -AssemblyName System.Drawing
$taskRoot = Split-Path -Parent $PSScriptRoot
$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#101b21'))
$pen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#76e5d6'), 10)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawEllipse($pen, 56, 56, 144, 144)
$graphics.DrawLine($pen, 128, 36, 128, 91)
$graphics.DrawLine($pen, 128, 165, 128, 220)
$graphics.DrawLine($pen, 36, 128, 91, 128)
$graphics.DrawLine($pen, 165, 128, 220, 128)
$brush = [System.Drawing.SolidBrush]::new($pen.Color)
$graphics.FillEllipse($brush, 121, 121, 14, 14)
$bitmap.Save((Join-Path $taskRoot 'build/icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create((Join-Path $taskRoot 'build/icon.ico'))
$icon.Save($stream)
$stream.Dispose()
$icon.Dispose()
$brush.Dispose()
$pen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
