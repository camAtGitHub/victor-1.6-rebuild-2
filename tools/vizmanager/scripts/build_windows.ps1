#Requires -Version 5.1
<#
.SYNOPSIS
  Freeze Host VizManager to a standalone Windows onedir (no repo on the target PC).

.DESCRIPTION
  Run on Windows after setup_windows.ps1 (Python 3.10+, generated CLAD).
  Does not require the recipient to have this git tree.

  Output: tools/vizmanager/dist/VizManager/  (zip THAT folder)

.PARAMETER SkipPip
  Skip pip install -e ".[exe]" (PyInstaller already installed).

.PARAMETER ForcePip
  Reinstall even if PyInstaller already imports. Default is skip pip when
  `import PyInstaller` works (avoids Windows Scripts\*.exe file locks).

.PARAMETER Python
  Python executable (default: py -3, then python, then python3).
#>
[CmdletBinding()]
param(
    [switch]$SkipPip,
    [switch]$ForcePip,
    [string]$Python = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))
}

function Get-PythonExe {
    param([string]$Preferred)
    $candidates = @()
    if ($Preferred) { $candidates += $Preferred }
    $candidates += @("py -3", "python", "python3")
    foreach ($c in $candidates) {
        $parts = $c -split " ", 2
        $exe = $parts[0]
        $rest = if ($parts.Length -gt 1) { $parts[1] } else { $null }
        try {
            $args = @()
            if ($rest) { $args += $rest }
            $args += "--version"
            $out = & $exe @args 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0) { continue }
            if ($out -notmatch "Python (\d+)\.(\d+)") { continue }
            $maj = [int]$Matches[1]
            $min = [int]$Matches[2]
            if ($maj -gt 3 -or ($maj -eq 3 -and $min -ge 10)) {
                return @{ Exe = $exe; Prefix = $(if ($rest) { @($rest) } else { @() }) }
            }
            Write-Warning "Skipping $c ($($out.Trim()); need 3.10+)"
        } catch {
            continue
        }
    }
    throw "Need Python 3.10+ on PATH."
}

function Invoke-Py {
    param($Py)
    $all = @($Py.Prefix) + @($args)
    & $Py.Exe @all
    if ($LASTEXITCODE -ne 0) {
        throw "python failed ($LASTEXITCODE)"
    }
}

function Test-PyModule {
    param($Py, [string]$Name)
    # PS 5.1 + ErrorAction Stop: python stderr (ImportError traceback) becomes
    # NativeCommandError and kills the script. find_spec writes nothing on miss.
    $code = "import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('$Name') else 1)"
    $all = @($Py.Prefix) + @("-c", $code)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        & $Py.Exe @all 1>$null 2>$null | Out-Null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Invoke-PipInstallRetry {
    # Windows pip + Defender: replacing Scripts\pyi-*.exe uses a .deleteme rename
    # that often hits WinError 2. Retrying is the usual fix (next file, next run).
    param($Py, [string[]]$PipArgs, [int]$Tries = 8)
    for ($i = 1; $i -le $Tries; $i++) {
        Write-Host "pip attempt $i/$Tries"
        $all = @($Py.Prefix) + @("-m", "pip") + $PipArgs
        & $Py.Exe @all
        if ($LASTEXITCODE -eq 0) { return }
        Write-Warning ("pip exit {0}. Windows locked a Scripts\\*.exe (pip .deleteme / Defender). Retry in {1}s." -f $LASTEXITCODE, (2 * $i))
        if ($i -eq $Tries) {
            throw @"
pip install failed after $Tries tries (WinError 2 / .deleteme is normal on Windows).
Close other python.exe / VizManager / antivirus popups and re-run.
If PyInstaller already works: -SkipPip
To reinstall anyway: -ForcePip
Optional: exclude C:\Python311\Scripts from Defender real-time scanning.
"@
        }
        Start-Sleep -Seconds (2 * $i)
    }
}

$Root = Get-RepoRoot
$Pkg = Join-Path $Root "tools\vizmanager"
$Spec = Join-Path $Pkg "VizManager.spec"
$MessageViz = Join-Path $Root "generated\cladPython\clad\vizInterface\messageViz.py"
$Shipping = Join-Path $Pkg "SHIPPING.md"
$DistDir = Join-Path $Pkg "dist\VizManager"

Write-Host "Repo     $Root"
if (-not (Test-Path -LiteralPath $Spec)) {
    throw "missing $Spec"
}
if (-not (Test-Path -LiteralPath $MessageViz)) {
    throw "missing $MessageViz - run tools\vizmanager\scripts\setup_windows.ps1 first"
}

$Py = Get-PythonExe -Preferred $Python
Write-Host "Python   $($Py.Exe) $($Py.Prefix -join ' ')"

Push-Location $Pkg
try {
    $doPip = -not $SkipPip
    if ($doPip -and -not $ForcePip -and (Test-PyModule $Py "PyInstaller")) {
        Write-Host "PyInstaller already importable; skipping pip (pass -ForcePip to reinstall)."
        $doPip = $false
    }
    if ($doPip) {
        Write-Host ""
        Write-Host "=== pip install -e .[exe] (PyInstaller) ==="
        Write-Host "Windows may lock Scripts\pyi-*.exe; this step retries on WinError 2."
        Invoke-PipInstallRetry $Py @("install", "-e", ".[exe]", "--upgrade-strategy", "only-if-needed")
    }
    Write-Host ""
    Write-Host "=== pyinstaller --noconfirm --clean VizManager.spec ==="
    Invoke-Py $Py @("-m", "PyInstaller", "--noconfirm", "--clean", $Spec)
}
finally {
    Pop-Location
}

$exe = Join-Path $DistDir "VizManager.exe"
if (-not (Test-Path -LiteralPath $exe)) {
    throw "expected $exe after PyInstaller"
}
if (Test-Path -LiteralPath $Shipping) {
    Copy-Item -LiteralPath $Shipping -Destination (Join-Path $DistDir "README.txt") -Force
}

Write-Host ""
Write-Host "Built $exe"
Write-Host "Ship the WHOLE folder (exe + _internal), not the exe alone:"
Write-Host "  $DistDir"
Write-Host ""
Write-Host "Recipients do not need this repo, Python, or generated/cladPython."
Write-Host "Defender inbound UDP 5252,5200 for VizManager.exe; robot INPUT 5103 from their LAN IP."
