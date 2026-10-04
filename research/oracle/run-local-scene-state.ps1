[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ExtractedRoot,

    [Parameter(Mandatory = $true)]
    [string]$OutputRoot,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9][a-z0-9-]{0,63}$')]
    [string]$RunId,

    [ValidateSet('baseline', 'seed-1234', 'writer-seed-1234',
                 'writer-stream-seed-1234', 'writer-sequence-seed-1234',
                 'writer-windows-seed-1234', 'writer-full-seed-1234',
                 'writer-full-seed-5678',
                 'select-brush-matrix-seed-1234',
                 'natural-free-path-seed-1234',
                 'natural-free-path-seed-5678',
                 'natural-free-path-ran-seed-1234',
                 'screen-unit-seed-1234',
                 'screen-unit-seed-5678',
                 'transition-seed-1234', 'plan-seed-1234')]
    [string]$Mode = 'baseline',

    [ValidateRange(10, 600)]
    [int]$RunSeconds = 120,

    [switch]$SmallImage,

    [string]$PreSceneProbePath,

    [ValidateRange(0, 300)]
    [int]$PreSceneProbePauseSeconds = 0,

    [ValidatePattern('^[a-z][a-z0-9-]*\.(txt|bin|json)$')]
    [string[]]$ProbeOutputNames = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$extracted = (Resolve-Path -LiteralPath $ExtractedRoot).Path
$output = [IO.Path]::GetFullPath($OutputRoot)
$application = Join-Path $extracted 'application'
$preSceneProbeSource = $null
$stagedPreSceneProbeSha256 = $null
if ($PreSceneProbePath) {
    $preSceneProbeSource = (Resolve-Path -LiteralPath $PreSceneProbePath).Path
    if (-not (Test-Path -LiteralPath $preSceneProbeSource -PathType Leaf) -or
        [IO.Path]::GetExtension($preSceneProbeSource) -ne '.cl') {
        throw 'PreSceneProbePath must identify a saved .cl file'
    }
}
if ($PreSceneProbePauseSeconds -gt 0 -and -not $preSceneProbeSource) {
    throw 'A pre-scene pause requires PreSceneProbePath'
}
if ($PreSceneProbePauseSeconds -ge $RunSeconds) {
    throw 'The pre-scene pause must be shorter than RunSeconds'
}
$manifest = Get-Content -LiteralPath (Join-Path $extracted 'manifest.json') -Raw |
    ConvertFrom-Json
$sourceName = switch ($Mode) {
    'baseline' { 'scene-state-snapshot.cl' }
    'seed-1234' { 'scene-state-snapshot-seeded-1234.cl' }
    'writer-seed-1234' { 'scene-state-snapshot-writer-seeded-1234.cl' }
    'writer-stream-seed-1234' { 'scene-state-snapshot-writer-stream-seeded-1234.cl' }
    'writer-sequence-seed-1234' { 'scene-state-snapshot-writer-sequence-seeded-1234.cl' }
    'writer-windows-seed-1234' { 'scene-state-snapshot-writer-windows-seeded-1234.cl' }
    'writer-full-seed-1234' { 'scene-state-snapshot-writer-full-seeded-1234.cl' }
    'writer-full-seed-5678' { 'scene-state-snapshot-writer-full-seeded-5678.cl' }
    'select-brush-matrix-seed-1234' { 'scene-state-snapshot-select-brush-matrix-seeded-1234.cl' }
    'natural-free-path-seed-1234' { 'scene-state-snapshot-natural-free-path-seeded-1234.cl' }
    'natural-free-path-seed-5678' { 'scene-state-snapshot-natural-free-path-seeded-5678.cl' }
    'natural-free-path-ran-seed-1234' { 'scene-state-snapshot-natural-free-path-ran-seeded-1234.cl' }
    'screen-unit-seed-1234' { 'scene-state-snapshot-screen-unit-seeded-1234.cl' }
    'screen-unit-seed-5678' { 'scene-state-snapshot-screen-unit-seeded-5678.cl' }
    'transition-seed-1234' { 'scene-state-snapshot-transition-seeded-1234.cl' }
    'plan-seed-1234' { 'scene-state-snapshot-plan-seeded-1234.cl' }
}
$temporaryNames = @(
    'image', 'image-id', 'rseed',
    'aaron-scene-state-snapshot.txt', 'aaron-planning-call-trace.txt',
    'aaron-writer-full.txt', 'aaron-select-brush-matrix.txt',
    'aaron-free-path-natural.txt',
    'aaron-free-path-ran.txt',
    'aaron-screen-units.txt',
    'aaron-random-samples.txt', 'aaron-random-seed-loaded.txt',
    'planning-call-trace.cl', 'planning-random-seed-common.cl',
    'scene-state-snapshot.cl', 'scene-state-snapshot-seeded-1234.cl',
    'scene-state-snapshot-writer-seeded-1234.cl',
    'scene-state-snapshot-writer-stream-seeded-1234.cl',
    'scene-state-snapshot-writer-sequence-seeded-1234.cl',
    'scene-state-snapshot-writer-windows-seeded-1234.cl',
    'scene-state-snapshot-writer-full-seeded-1234.cl',
    'scene-state-snapshot-writer-full-seeded-5678.cl',
    'scene-state-snapshot-select-brush-matrix-seeded-1234.cl',
    'scene-state-snapshot-natural-free-path-seeded-1234.cl',
    'scene-state-snapshot-natural-free-path-seeded-5678.cl',
    'aaron-natural-free-path-capture.cl',
    'scene-state-snapshot-natural-free-path-ran-seeded-1234.cl',
    'aaron-natural-free-path-ran-capture.cl',
    'scene-state-snapshot-screen-unit-seeded-1234.cl',
    'scene-state-snapshot-screen-unit-seeded-5678.cl',
    'aaron-natural-screen-unit-capture.cl',
    'aaron-natural-screen-color-capture.cl',
    'aaron-screen-color-data.txt',
    'scene-state-snapshot-transition-seeded-1234.cl',
    'scene-state-snapshot-plan-seeded-1234.cl'
) + @(0..15 | ForEach-Object { "aa$_" })
foreach ($name in $ProbeOutputNames) {
    if ($name -in $temporaryNames -or $name -eq 'aaron-native-code-release.txt') {
        throw "Probe output name is reserved by the scene runner: $name"
    }
}
$temporaryNames += @($ProbeOutputNames | Select-Object -Unique)
if ($preSceneProbeSource) {
    $temporaryNames += @('aaron-pre-scene-probe.cl', 'aaron-probe-loader.cl')
}
if ($PreSceneProbePauseSeconds -gt 0) {
    $temporaryNames += 'aaron-native-code-release.txt'
}

if (-not (Test-Path -LiteralPath 'C:\temp' -PathType Container)) {
    throw 'AARON requires an existing C:\temp directory'
}
foreach ($name in $temporaryNames) {
    if (Test-Path -LiteralPath (Join-Path 'C:\temp' $name)) {
        throw "C:\temp already contains $name; it was left untouched. Inspect and back it up before moving it."
    }
}
$writeProbe = Join-Path 'C:\temp' ('.aaron-oracle-write-probe-' +
    [Guid]::NewGuid().ToString('N') + '.tmp')
try {
    [IO.File]::WriteAllText($writeProbe, 'AARON oracle C:\temp write preflight')
}
catch {
    throw ('C:\temp exists but this PowerShell execution context cannot write there. ' +
        'Run this script with an approved elevated sandbox permission, or from a ' +
        'normal user PowerShell session that can write to C:\temp. No oracle ' +
        'output directory was created. Original error: ' + $_.Exception.Message)
}
finally {
    if (Test-Path -LiteralPath $writeProbe) {
        Remove-Item -LiteralPath $writeProbe -Force -ErrorAction SilentlyContinue
    }
}
if (Test-Path -LiteralPath $output) {
    throw "OutputRoot already exists: $output"
}

# The archived extractor verifies the setup SHA-256. Check every extracted
# application member again before preparing a disposable local runtime.
foreach ($entry in $manifest.files) {
    $source = Join-Path $application $entry.installedName
    $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $entry.sha256) {
        throw "Extracted file hash mismatch: $($entry.installedName)"
    }
}

$runtime = Join-Path $output 'runtime'
$capture = Join-Path $output 'capture'
New-Item -ItemType Directory -Force -Path $runtime, $capture | Out-Null
foreach ($entry in $manifest.files) {
    Copy-Item -LiteralPath (Join-Path $application $entry.installedName) `
        -Destination (Join-Path $runtime $entry.installedName) -Force
}
$registryHash = ($manifest.files | Where-Object installedName -eq 'registry.dll').sha256
$licenseHash = ($manifest.files | Where-Object installedName -eq 'license.dll').sha256
$registryPatch = & (Join-Path $repoRoot 'research\tools\patch-registry-running.ps1') `
    -Path (Join-Path $application 'registry.dll') `
    -OutputPath (Join-Path $runtime 'registry.dll') `
    -ExpectedSha256 $registryHash `
    -Exports @('KCATisRunning', 'KCATgetDaysSinceInstalled') | ConvertFrom-Json
$licensePatch = & (Join-Path $repoRoot 'research\tools\patch-license-user-registry.ps1') `
    -Path (Join-Path $application 'license.dll') `
    -OutputPath (Join-Path $runtime 'license.dll') `
    -ExpectedSha256 $licenseHash | ConvertFrom-Json

$sources = @{
    'planning-call-trace.cl' = Join-Path $repoRoot 'research\introspection\planning-call-trace.cl'
    'planning-random-seed-common.cl' = Join-Path $repoRoot 'research\oracle\planning-random-seed-common.cl'
    'scene-state-snapshot.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot.cl'
    'scene-state-snapshot-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-seeded-1234.cl'
    'scene-state-snapshot-writer-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-seeded-1234.cl'
    'scene-state-snapshot-writer-stream-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-stream-seeded-1234.cl'
    'scene-state-snapshot-writer-sequence-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-sequence-seeded-1234.cl'
    'scene-state-snapshot-writer-windows-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-windows-seeded-1234.cl'
    'scene-state-snapshot-writer-full-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-full-seeded-1234.cl'
    'scene-state-snapshot-writer-full-seeded-5678.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-writer-full-seeded-5678.cl'
    'scene-state-snapshot-select-brush-matrix-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-select-brush-matrix-seeded-1234.cl'
    'scene-state-snapshot-natural-free-path-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-natural-free-path-seeded-1234.cl'
    'scene-state-snapshot-natural-free-path-seeded-5678.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-natural-free-path-seeded-5678.cl'
    'aaron-natural-free-path-capture.cl' = Join-Path $repoRoot 'research\introspection\natural-free-path-capture.cl'
    'scene-state-snapshot-natural-free-path-ran-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-natural-free-path-ran-seeded-1234.cl'
    'aaron-natural-free-path-ran-capture.cl' = Join-Path $repoRoot 'research\introspection\natural-free-path-ran-capture.cl'
    'scene-state-snapshot-screen-unit-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-screen-unit-seeded-1234.cl'
    'scene-state-snapshot-screen-unit-seeded-5678.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-screen-unit-seeded-5678.cl'
    'aaron-natural-screen-unit-capture.cl' = Join-Path $repoRoot 'research\introspection\natural-screen-unit-capture.cl'
    'aaron-natural-screen-color-capture.cl' = Join-Path $repoRoot 'research\introspection\natural-screen-color-capture.cl'
    'scene-state-snapshot-transition-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-transition-seeded-1234.cl'
    'scene-state-snapshot-plan-seeded-1234.cl' = Join-Path $repoRoot 'research\introspection\scene-state-snapshot-plan-seeded-1234.cl'
}
$stagedNames = @('planning-call-trace.cl', 'planning-random-seed-common.cl',
                 'scene-state-snapshot.cl')
$launchSourceName = $sourceName
if ($preSceneProbeSource) {
    $sources['aaron-pre-scene-probe.cl'] = $preSceneProbeSource
    $launchSourceName = 'aaron-probe-loader.cl'
    $loaderPath = Join-Path $runtime $launchSourceName
    $loaderSource = "(set 'aaron-pre-scene-probe-pause-seconds $PreSceneProbePauseSeconds)" + "`r`n" +
        '(load "C:\\temp\\aaron-pre-scene-probe.cl")' + "`r`n" +
        '(load "C:\\temp\\' + $sourceName + '")' + "`r`n"
    [IO.File]::WriteAllText($loaderPath, $loaderSource, [Text.UTF8Encoding]::new($false))
    $sources[$launchSourceName] = $loaderPath
    $stagedNames += @('aaron-pre-scene-probe.cl', $launchSourceName)
}
if ($Mode -ne 'baseline') { $stagedNames += 'scene-state-snapshot-seeded-1234.cl' }
if ($Mode -in @('writer-seed-1234', 'writer-stream-seed-1234',
               'writer-sequence-seed-1234', 'writer-windows-seed-1234',
               'writer-full-seed-1234', 'screen-unit-seed-1234',
               'transition-seed-1234', 'select-brush-matrix-seed-1234')) {
    $stagedNames += 'scene-state-snapshot-writer-seeded-1234.cl'
}
if ($Mode -in @('writer-stream-seed-1234', 'writer-sequence-seed-1234',
               'writer-windows-seed-1234', 'writer-full-seed-1234',
               'screen-unit-seed-1234')) {
    $stagedNames += 'scene-state-snapshot-writer-stream-seeded-1234.cl'
}
if ($Mode -eq 'writer-sequence-seed-1234') {
    $stagedNames += 'scene-state-snapshot-writer-sequence-seeded-1234.cl'
}
if ($Mode -eq 'writer-windows-seed-1234') {
    $stagedNames += 'scene-state-snapshot-writer-windows-seeded-1234.cl'
}
if ($Mode -in @('writer-full-seed-1234', 'screen-unit-seed-1234')) {
    $stagedNames += 'scene-state-snapshot-writer-full-seeded-1234.cl'
}
if ($Mode -in @('writer-full-seed-5678', 'screen-unit-seed-5678')) {
    $stagedNames += 'scene-state-snapshot-writer-full-seeded-5678.cl'
}
if ($Mode -in @('transition-seed-1234', 'select-brush-matrix-seed-1234')) {
    $stagedNames += 'scene-state-snapshot-transition-seeded-1234.cl'
}
if ($Mode -eq 'select-brush-matrix-seed-1234') {
    $stagedNames += 'scene-state-snapshot-select-brush-matrix-seeded-1234.cl'
}
if ($Mode -in @('natural-free-path-seed-1234', 'natural-free-path-ran-seed-1234')) {
    $stagedNames += $(if ($Mode -eq 'natural-free-path-ran-seed-1234') {
        'scene-state-snapshot-natural-free-path-ran-seeded-1234.cl'
    } else {
        'scene-state-snapshot-natural-free-path-seeded-1234.cl'
    })
    $stagedNames += 'aaron-natural-free-path-capture.cl'
}
if ($Mode -eq 'natural-free-path-ran-seed-1234') {
    $stagedNames += 'aaron-natural-free-path-ran-capture.cl'
}
if ($Mode -eq 'natural-free-path-seed-5678') {
    $stagedNames += 'scene-state-snapshot-natural-free-path-seeded-5678.cl'
    $stagedNames += 'aaron-natural-free-path-capture.cl'
}
if ($Mode -eq 'screen-unit-seed-1234') {
    $stagedNames += 'scene-state-snapshot-screen-unit-seeded-1234.cl'
    $stagedNames += 'aaron-natural-screen-unit-capture.cl'
    $stagedNames += 'aaron-natural-screen-color-capture.cl'
}
if ($Mode -eq 'screen-unit-seed-5678') {
    $stagedNames += 'scene-state-snapshot-screen-unit-seeded-5678.cl'
    $stagedNames += 'aaron-natural-screen-unit-capture.cl'
}
if ($Mode -eq 'plan-seed-1234') {
    $stagedNames += 'scene-state-snapshot-plan-seeded-1234.cl'
}
$registryPath = 'HKCU:\Software\Kurzweil CyberArt Technologies\AARON'
$registryParent = Split-Path -Path $registryPath -Parent
$registryParentExisted = Test-Path -Path $registryParent
$registryExisted = Test-Path -Path $registryPath
$registryCreated = $false
$registryTouched = $false
$registryValues = @{}
$environmentNames = @('KCAT_AARON_SMALL_IMAGE', '__COMPAT_LAYER',
                      'KCAT_AARON_DEBUG', 'ACL_STARTUP_DEBUG') + @(
    Get-ChildItem Env: | Where-Object {
        $_.Name -match 'TOKEN|SECRET|PASS|CRED|AUTH|API_KEY'
    } | ForEach-Object Name
)
$originalEnvironment = @{}
$process = $null
$complete = $false
$started = [DateTimeOffset]::UtcNow
try {
    foreach ($name in $stagedNames) {
        Copy-Item -LiteralPath $sources[$name] -Destination (Join-Path 'C:\temp' $name)
    }
    if ($preSceneProbeSource) {
        $stagedPreSceneProbeSha256 = (Get-FileHash -LiteralPath 'C:\temp\aaron-pre-scene-probe.cl' `
            -Algorithm SHA256).Hash.ToLowerInvariant()
        $probeRequest = [ordered]@{
            schemaVersion = 1
            runId = $RunId
            runtimeExecutable = (Join-Path $runtime 'AARON.exe')
            probeSha256 = $stagedPreSceneProbeSha256
            pauseSeconds = $PreSceneProbePauseSeconds
            releaseFile = 'C:\temp\aaron-native-code-release.txt'
            probeOutputNames = @($ProbeOutputNames)
        }
        [IO.File]::WriteAllText((Join-Path $output 'pre-scene-probe-request.json'),
            ($probeRequest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
    }
    foreach ($initName in @('.clinit.cl', 'clinit.cl')) {
        Copy-Item -LiteralPath $sources[$launchSourceName] `
            -Destination (Join-Path $runtime $initName)
    }

    if (-not $registryExisted) {
        New-Item -Path $registryPath -Force | Out-Null
        $registryCreated = $true
    } else {
        $key = Get-Item -Path $registryPath
        foreach ($name in $key.GetValueNames()) {
            $registryValues[$name] = @{
                value = $key.GetValue($name, $null,
                    [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                kind = $key.GetValueKind($name)
            }
        }
    }
    $registryTouched = $true
    New-ItemProperty -Path $registryPath -Name ImagesDirectory -Value 'C:\temp' `
        -PropertyType String -Force | Out-Null

    foreach ($name in ($environmentNames | Select-Object -Unique)) {
        $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
    if ($SmallImage) { $env:KCAT_AARON_SMALL_IMAGE = '1' }

    $process = Start-Process -FilePath (Join-Path $runtime 'AARON.exe') `
        -ArgumentList @('-L', (Join-Path 'C:\temp' $launchSourceName), '--', 'screen-saver') `
        -WorkingDirectory $runtime -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $output 'stdout.txt') `
        -RedirectStandardError (Join-Path $output 'stderr.txt')
    $deadline = [DateTime]::UtcNow.AddSeconds($RunSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Seconds 2
        $aaPath = 'C:\temp\aa0'
        $reportPath = 'C:\temp\aaron-scene-state-snapshot.txt'
        if ((Test-Path -LiteralPath $aaPath -PathType Leaf) -and
            (Test-Path -LiteralPath $reportPath -PathType Leaf)) {
            $lastLine = Get-Content -LiteralPath $aaPath -Tail 1 -ErrorAction SilentlyContinue
            $reportEnded = Select-String -LiteralPath $reportPath `
                -SimpleMatch 'END scene-state-snapshot' -Quiet -ErrorAction SilentlyContinue
            if ($lastLine -eq 'end' -and $reportEnded) {
                $complete = $true
                break
            }
        }
        if ($process.HasExited) { break }
    }
} finally {
    if ($null -ne $process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        [void]$process.WaitForExit(10000)
    }
    foreach ($name in $temporaryNames) {
        $path = Join-Path 'C:\temp' $name
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Copy-Item -LiteralPath $path -Destination (Join-Path $capture $name) -Force
            Remove-Item -LiteralPath $path -Force
        }
    }
    foreach ($name in $originalEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], 'Process')
    }
    if ($registryCreated) {
        Remove-Item -Path $registryPath -Recurse -Force
        if (-not $registryParentExisted -and
            @(Get-ChildItem -Path $registryParent).Count -eq 0 -and
            @((Get-Item -Path $registryParent).GetValueNames()).Count -eq 0) {
            Remove-Item -Path $registryParent -Force
        }
    } elseif ($registryTouched) {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(
            'Software\Kurzweil CyberArt Technologies\AARON', $true)
        if ($null -eq $key) { throw 'The per-user AARON registry key disappeared during the run' }
        try {
            foreach ($name in $key.GetValueNames()) {
                if (-not $registryValues.ContainsKey($name)) { $key.DeleteValue($name, $false) }
            }
            foreach ($name in $registryValues.Keys) {
                $prior = $registryValues[$name]
                $key.SetValue($name, $prior.value, $prior.kind)
            }
        } finally {
            $key.Dispose()
        }
    }
}

$report = Join-Path $capture 'aaron-scene-state-snapshot.txt'
if (-not $complete -or -not (Test-Path -LiteralPath $report)) {
    throw "The local scene-state run did not complete; inspect $output"
}
if ($Mode -in @('writer-full-seed-1234', 'writer-full-seed-5678',
               'screen-unit-seed-1234', 'screen-unit-seed-5678')) {
    $fullTape = Join-Path $capture 'aaron-writer-full.txt'
    if (-not (Test-Path -LiteralPath $fullTape -PathType Leaf) -or
        -not (Select-String -LiteralPath $fullTape -Pattern '^END writer-full$' -Quiet)) {
        throw "The complete writer tape did not finish; inspect $output"
    }
}
if ($Mode -in @('screen-unit-seed-1234', 'screen-unit-seed-5678')) {
    $screenReport = Join-Path $capture 'aaron-screen-units.txt'
    if (-not (Test-Path -LiteralPath $screenReport -PathType Leaf) -or
        -not (Select-String -LiteralPath $screenReport -Pattern '^READY target=SCREEN-AND-STORE$' -Quiet) -or
        -not (Select-String -LiteralPath $screenReport -Pattern '^CALL id=1 ' -Quiet) -or
        -not (Select-String -LiteralPath $screenReport -Pattern '^RETURN id=1 ' -Quiet)) {
        throw "The natural SCREEN-AND-STORE unit capture did not finish; inspect $output"
    }
}
if ($Mode -eq 'screen-unit-seed-1234') {
    $colorReport = Join-Path $capture 'aaron-screen-color-data.txt'
    if (-not (Test-Path -LiteralPath $colorReport -PathType Leaf) -or
        -not (Select-String -LiteralPath $colorReport -Pattern '^READY target=SCREEN-AND-STORE$' -Quiet) -or
        -not (Select-String -LiteralPath $colorReport -Pattern '^COLORS-BEGIN ' -Quiet) -or
        -not (Select-String -LiteralPath $colorReport -Pattern '^COLOR index=35 ' -Quiet) -or
        -not (Select-String -LiteralPath $colorReport -Pattern '^END natural-screen-color-data$' -Quiet) -or
        -not (Select-String -LiteralPath $colorReport -Pattern '^MAPPOINT phase=before call=1 ' -Quiet)) {
        throw "The natural colour/map observation did not start; inspect $output"
    }
}
if ($Mode -eq 'select-brush-matrix-seed-1234') {
    $brushMatrix = Join-Path $capture 'aaron-select-brush-matrix.txt'
    if (-not (Test-Path -LiteralPath $brushMatrix -PathType Leaf) -or
        -not (Select-String -LiteralPath $brushMatrix -Pattern '^SWEEP-STATUS status=COMPLETE cases=[0-9]+$' -Quiet) -or
        -not (Select-String -LiteralPath $brushMatrix -Pattern '^SWEEP-STATUS status=COMPLETE inputs=200001 lower=0 upper-inclusive=200000$' -Quiet) -or
        -not (Select-String -LiteralPath $brushMatrix -Pattern '^END select-brush-boundary-matrix$' -Quiet)) {
        throw "The SELECT-BRUSH matrix or exhaustive integer sweep did not finish; inspect $output"
    }
}
if ($Mode -in @('natural-free-path-seed-1234', 'natural-free-path-seed-5678',
               'natural-free-path-ran-seed-1234')) {
    $freePathReport = Join-Path $capture 'aaron-free-path-natural.txt'
    if (-not (Test-Path -LiteralPath $freePathReport -PathType Leaf) -or
        -not (Select-String -LiteralPath $freePathReport -Pattern '^INSTALL target=FREE-PATH ' -Quiet) -or
        -not (Select-String -LiteralPath $freePathReport -Pattern '^CALL id=1 ' -Quiet)) {
        throw "The natural FREE-PATH capture did not start; inspect $output"
    }
}
if ($Mode -eq 'natural-free-path-ran-seed-1234') {
    $ranReport = Join-Path $capture 'aaron-free-path-ran.txt'
    if (-not (Test-Path -LiteralPath $ranReport -PathType Leaf) -or
        -not (Select-String -LiteralPath $ranReport -Pattern '^READY free-path=' -Quiet) -or
        -not (Select-String -LiteralPath $ranReport -Pattern '^RETURN id=3 ' -Quiet)) {
        throw "The natural FREE-PATH RAN capture did not complete; inspect $output"
    }
}
$normalized = Join-Path $output 'scene-state.json'
& node (Join-Path $repoRoot 'research\tools\parse-scene-state-report.mjs') `
    $report "local:$RunId" > $normalized
if ($LASTEXITCODE -ne 0) { throw 'Scene-state report validation failed' }

$finished = [DateTimeOffset]::UtcNow
$summary = [ordered]@{
    runId = $RunId
    mode = $Mode
    smallImage = [bool]$SmallImage
    preSceneProbeSha256 = $stagedPreSceneProbeSha256
    probeOutputNames = @($ProbeOutputNames)
    preSceneProbePauseSeconds = $PreSceneProbePauseSeconds
    complete = $complete
    startedAt = $started.ToString('o')
    finishedAt = $finished.ToString('o')
    installerSha256 = $manifest.source.sha256
    registryPatchSha256 = $registryPatch.outputSha256
    licensePatchSha256 = $licensePatch.outputSha256
    aa0Sha256 = (Get-FileHash -LiteralPath (Join-Path $capture 'aa0') `
        -Algorithm SHA256).Hash.ToLowerInvariant()
    sceneReportSha256 = (Get-FileHash -LiteralPath $report `
        -Algorithm SHA256).Hash.ToLowerInvariant()
}
$summary | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $output 'summary.json') -Encoding utf8
$summary | ConvertTo-Json -Depth 5
