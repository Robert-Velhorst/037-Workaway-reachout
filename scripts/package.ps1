$ErrorActionPreference = 'Stop'
function Get-ReleaseSha256([string]$filePath) {
  $hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
  $fileStream = [System.IO.File]::OpenRead($filePath)
  try {
    return [BitConverter]::ToString($hashAlgorithm.ComputeHash($fileStream)).Replace('-', '').ToLowerInvariant()
  } finally {
    $fileStream.Dispose()
    $hashAlgorithm.Dispose()
  }
}
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) {
  throw 'Voer eerst npm.cmd run verify uit om de app te bouwen en te controleren.'
}
$releaseVersion = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$stagePath = Join-Path ([System.IO.Path]::GetTempPath()) ('reach-out-release-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $stagePath | Out-Null
# An explicit allowlist prevents user data, credentials, old archives or dependencies entering the release.
$releaseFiles = @('dist', 'server', 'src', 'public', 'scripts', 'tests', 'README.md', 'Start Reach Out.cmd', 'package.json', 'package-lock.json', 'index.html', 'vite.config.js', 'playwright.config.js', '.gitignore')
foreach ($releaseFile in $releaseFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $releaseFile) -Destination $stagePath -Recurse
}
$releaseManifest = Get-ChildItem -LiteralPath $stagePath -File -Recurse | ForEach-Object {
  $relativePath = $_.FullName.Substring($stagePath.Length + 1).Replace('\', '/')
  [ordered]@{ path = $relativePath; bytes = $_.Length; sha256 = Get-ReleaseSha256 $_.FullName }
}
[ordered]@{ version = $releaseVersion; builtAt = [DateTime]::UtcNow.ToString('o'); files = @($releaseManifest) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $stagePath 'release-manifest.json') -Encoding UTF8
$releasePath = Join-Path $projectRoot ('Reach-Out-v' + $releaseVersion + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($stagePath, $releasePath)
$releaseHash = Get-ReleaseSha256 $releasePath
($releaseHash + '  ' + (Split-Path -Leaf $releasePath)) | Set-Content -LiteralPath ($releasePath + '.sha256') -Encoding ASCII
Write-Output $releasePath
Write-Output ('SHA256: ' + $releaseHash)
