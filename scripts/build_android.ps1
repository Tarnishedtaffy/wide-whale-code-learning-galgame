param([switch]$UseTcpPipeWorkaround)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$previousJavaOptions = $env:JAVA_TOOL_OPTIONS
try {
    if ($UseTcpPipeWorkaround) {
        # A missing UDS directory makes the JDK fall back to a normal TCP pipe.
        # This is scoped to this build; no system networking settings are changed.
        $socketPath = Join-Path $taskRoot 'dist/unavailable-unix-sockets'
        if (Test-Path -LiteralPath $socketPath) { throw 'The workaround path must not exist.' }
        $env:JAVA_TOOL_OPTIONS = "$previousJavaOptions -Djdk.net.unixdomain.tmpdir=$socketPath".Trim()
    }
    Push-Location $taskRoot
    try {
        if (Get-Command py -ErrorAction SilentlyContinue) { & py -3 scripts/package_portable.py }
        else { & python scripts/package_portable.py }
        if ($LASTEXITCODE -ne 0) { throw 'Portable web packaging failed.' }
        & ./android/gradlew.bat -p android --no-daemon assembleDebug
        if ($LASTEXITCODE -ne 0) { throw 'Android build failed.' }
        $releaseDir = Join-Path $taskRoot 'dist/android'
        New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
        $apk = Join-Path $releaseDir 'Whale-Studio-0.1.0-preview.apk'
        Copy-Item -LiteralPath 'android/app/build/outputs/apk/debug/app-debug.apk' -Destination $apk
        $apkStream = [IO.File]::OpenRead($apk)
        $digest = [Security.Cryptography.SHA256]::Create()
        try {
            $hash = [BitConverter]::ToString($digest.ComputeHash($apkStream)).Replace('-', '').ToLowerInvariant()
            Write-Output "SHA256: $hash"
            Write-Output "APK: $apk"
        } finally { $apkStream.Dispose(); $digest.Dispose() }
    } finally { Pop-Location }
} finally { $env:JAVA_TOOL_OPTIONS = $previousJavaOptions }
