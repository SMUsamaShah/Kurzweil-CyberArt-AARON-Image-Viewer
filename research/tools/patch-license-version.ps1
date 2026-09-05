[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedSha256,

    [ValidateRange(0, 255)]
    [int]$ReturnValue = 1,

    [string]$OutputPath = $Path,

    [string]$Export = 'KCATversion'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-U16 {
    param([byte[]]$Bytes, [int]$Offset)
    return [BitConverter]::ToUInt16($Bytes, $Offset)
}

function Read-U32 {
    param([byte[]]$Bytes, [int]$Offset)
    return [BitConverter]::ToUInt32($Bytes, $Offset)
}

function Convert-RvaToFileOffset {
    param(
        [byte[]]$Bytes,
        [uint32]$Rva,
        [int]$SectionTable,
        [int]$SectionCount,
        [int]$SectionSize
    )

    for ($index = 0; $index -lt $SectionCount; $index++) {
        $section = $SectionTable + ($index * $SectionSize)
        $virtualSize = Read-U32 $Bytes ($section + 8)
        $virtualAddress = Read-U32 $Bytes ($section + 12)
        $rawSize = Read-U32 $Bytes ($section + 16)
        $rawAddress = Read-U32 $Bytes ($section + 20)
        $span = [Math]::Max($virtualSize, $rawSize)
        if ($Rva -ge $virtualAddress -and $Rva -lt ($virtualAddress + $span)) {
            return [int]($rawAddress + ($Rva - $virtualAddress))
        }
    }
    throw ('RVA 0x{0:X8} is not backed by a PE section' -f $Rva)
}

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "License DLL not found: $Path"
}

$expected = $ExpectedSha256.ToLowerInvariant()
$actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) {
    throw "Refusing to patch unexpected license.dll hash: $actual (expected $expected)"
}

$bytes = [IO.File]::ReadAllBytes($Path)
if ($bytes.Length -lt 0x40 -or (Read-U16 $bytes 0) -ne 0x5A4D) {
    throw 'Not a DOS PE image'
}
$peOffset = [int](Read-U32 $bytes 0x3C)
if ($peOffset -lt 0 -or $peOffset + 0x18 -ge $bytes.Length -or
    (Read-U32 $bytes $peOffset) -ne 0x00004550) {
    throw 'Invalid PE signature'
}

$sectionCount = [int](Read-U16 $bytes ($peOffset + 6))
$optionalSize = [int](Read-U16 $bytes ($peOffset + 20))
$optional = $peOffset + 24
if ((Read-U16 $bytes $optional) -ne 0x10B) { throw 'Expected PE32 optional header' }
$sectionTable = $optional + $optionalSize
$sectionSize = 40
$exportRva = Read-U32 $bytes ($optional + 96)
$exportSize = Read-U32 $bytes ($optional + 100)
$exportFile = Convert-RvaToFileOffset $bytes $exportRva $sectionTable $sectionCount $sectionSize
$nameCount = [int](Read-U32 $bytes ($exportFile + 24))
$functionsRva = Read-U32 $bytes ($exportFile + 28)
$namesRva = Read-U32 $bytes ($exportFile + 32)
$ordinalsRva = Read-U32 $bytes ($exportFile + 36)
$functionsFile = Convert-RvaToFileOffset $bytes $functionsRva $sectionTable $sectionCount $sectionSize
$namesFile = Convert-RvaToFileOffset $bytes $namesRva $sectionTable $sectionCount $sectionSize
$ordinalsFile = Convert-RvaToFileOffset $bytes $ordinalsRva $sectionTable $sectionCount $sectionSize

$targetOrdinal = $null
for ($index = 0; $index -lt $nameCount; $index++) {
    $nameRva = Read-U32 $bytes ($namesFile + ($index * 4))
    $nameFile = Convert-RvaToFileOffset $bytes $nameRva $sectionTable $sectionCount $sectionSize
    $end = $nameFile
    while ($end -lt $bytes.Length -and $bytes[$end] -ne 0) { $end++ }
    $name = [Text.Encoding]::ASCII.GetString($bytes, $nameFile, $end - $nameFile)
    if ($name -eq $Export) {
        $targetOrdinal = [int](Read-U16 $bytes ($ordinalsFile + ($index * 2)))
        break
    }
}
if ($null -eq $targetOrdinal) { throw "Requested export not found: $Export" }

$functionRva = Read-U32 $bytes ($functionsFile + ($targetOrdinal * 4))
if ($functionRva -ge $exportRva -and $functionRva -lt ($exportRva + $exportSize)) {
    throw ("{0} is a forwarded export at RVA 0x{1:X8}" -f $Export, $functionRva)
}
$functionFile = Convert-RvaToFileOffset $bytes $functionRva $sectionTable $sectionCount $sectionSize
$original = @($bytes[$functionFile..($functionFile + 2)])
if ($original[0] -ne 0x55 -or $original[1] -ne 0x8B -or $original[2] -ne 0xEC) {
    throw ('Unexpected {0} prologue: {1}' -f $Export,
        (($original | ForEach-Object { '{0:X2}' -f $_ }) -join ' '))
}

# Return a controlled Boolean-style license result without entering the web or
# registry licensing path. The installed copy is disposable and hash-guarded.
$bytes[$functionFile] = 0xB8
$returnBytes = [BitConverter]::GetBytes([uint32]$ReturnValue)
for ($index = 0; $index -lt 4; $index++) { $bytes[$functionFile + 1 + $index] = $returnBytes[$index] }
$bytes[$functionFile + 5] = 0xC3

$destination = [IO.Path]::GetFullPath($OutputPath)
$temporary = "$destination.$PID.tmp"
[IO.File]::WriteAllBytes($temporary, $bytes)
Move-Item -LiteralPath $temporary -Destination $destination -Force

[ordered]@{
    path = $destination
    inputSha256 = $actual
    outputSha256 = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()
    export = $Export
    returnValue = $ReturnValue
    functionRva = ('0x{0:X8}' -f $functionRva)
    functionFileOffset = ('0x{0:X8}' -f $functionFile)
    originalPrologue = (($original | ForEach-Object { '{0:X2}' -f $_ }) -join ' ')
    replacement = ('B8 {0:X2} 00 00 00 C3' -f $ReturnValue)
} | ConvertTo-Json -Compress
