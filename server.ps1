$port = 3001
$root = "D:\Software\Trae\project\scan"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$port/"

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    
    $path = $req.Url.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrEmpty($path)) { $path = "index.html" }
    
    $fp = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($root, $path))
    if ($fp.StartsWith($root) -and (Test-Path $fp)) {
        $ext = [System.IO.Path]::GetExtension($fp)
        $mime = @{
            '.html' = 'text/html'
            '.css' = 'text/css'
            '.js' = 'application/javascript'
            '.png' = 'image/png'
            '.jpg' = 'image/jpeg'
            '.jpeg' = 'image/jpeg'
            '.svg' = 'image/svg+xml'
            '.ico' = 'image/x-icon'
        }
        $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Access-Control-Allow-Origin', '*')
        $data = [System.IO.File]::ReadAllBytes($fp)
        $res.OutputStream.Write($data, 0, $data.Length)
        $res.StatusCode = 200
    } else {
        $res.StatusCode = 404
    }
    $res.Close()
}
$listener.Stop()
