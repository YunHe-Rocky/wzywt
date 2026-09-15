$ErrorActionPreference = 'Stop'
$musicRoot = $PSScriptRoot
$fullPath = Join-Path $musicRoot 'legionnaire2022-full.mp3'
$parts = @(
    @{ Name = 'source-prefix.bin'; Bytes = 2052220 },
    @{ Name = 'range-1.bin'; Bytes = 1500000 },
    @{ Name = 'range-2.bin'; Bytes = 1500000 },
    @{ Name = 'range-3.bin'; Bytes = 1500000 },
    @{ Name = 'range-4.bin'; Bytes = 934741 }
)
foreach ($part in $parts) {
    $partPath = Join-Path $musicRoot $part.Name
    $actual = (Get-Item -LiteralPath $partPath).Length
    if ($actual -ne $part.Bytes) { throw "Incomplete part $($part.Name): expected $($part.Bytes), got $actual" }
}
if (Test-Path -LiteralPath $fullPath) { throw 'Full assembled file already exists; refusing to overwrite.' }
$targetStream = [System.IO.File]::Create($fullPath)
try {
    foreach ($part in $parts) {
        $sourceStream = [System.IO.File]::OpenRead((Join-Path $musicRoot $part.Name))
        try { $sourceStream.CopyTo($targetStream) } finally { $sourceStream.Dispose() }
    }
} finally { $targetStream.Dispose() }
$size = (Get-Item -LiteralPath $fullPath).Length
if ($size -ne 7486961) { throw "Unexpected assembled size: $size" }
Get-Item -LiteralPath $fullPath | Select-Object Name, Length
Get-FileHash -LiteralPath $fullPath -Algorithm SHA256
