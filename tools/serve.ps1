# Локальный сервер для разработки и тестов: http://localhost:8765/ (без установки дополнительных программ).
param([int]$Port = 8765, [string]$Root = (Resolve-Path "$PSScriptRoot\..").Path)
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.webmanifest'='application/manifest+json'; '.woff2'='font/woff2'; '.png'='image/png'; '.svg'='image/svg+xml'; '.ico'='image/x-icon' }
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
Write-Host "Сервер запущен: http://localhost:$Port/  (корень: $Root)"
while ($l.IsListening) {
  $c = $l.GetContext()
  try {
    if (($c.Request.HttpMethod) -eq 'POST' -and $c.Request.Url.AbsolutePath -eq '/__report') {
      $sr = New-Object IO.StreamReader($c.Request.InputStream, [Text.Encoding]::UTF8); [IO.File]::WriteAllText((Join-Path $Root '.test-result.txt'), $sr.ReadToEnd(), (New-Object Text.UTF8Encoding $false)); $c.Response.StatusCode = 204; $c.Response.Close(); continue
    }
    if (($c.Request.HttpMethod) -eq 'POST' -and $c.Request.Url.AbsolutePath -eq '/__save') {
      $name = [Text.RegularExpressions.Regex]::Replace(($c.Request.QueryString['name']), '[^a-zA-Z0-9_-]', '')
      $dir = Join-Path $Root '.shots'; if (-not (Test-Path $dir)) { New-Item -ItemType Directory $dir | Out-Null }
      $sr = New-Object IO.StreamReader($c.Request.InputStream, [Text.Encoding]::UTF8); [IO.File]::WriteAllText((Join-Path $dir "$name.html"), $sr.ReadToEnd(), (New-Object Text.UTF8Encoding $false)); $c.Response.StatusCode = 204; $c.Response.Close(); continue
    }
    $rel = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $Root $rel))
    if ($path.StartsWith($Root) -and (Test-Path $path -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $c.Response.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
      $c.Response.Headers.Add('Cache-Control', 'no-store')
      $c.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else { $c.Response.StatusCode = 404 }
  } catch { $c.Response.StatusCode = 500 }
  $c.Response.Close()
}
