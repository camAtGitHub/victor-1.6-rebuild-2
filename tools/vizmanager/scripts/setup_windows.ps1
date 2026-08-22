#Requires -Version 5.1
<#
.SYNOPSIS
  Windows 10 setup for Host VizManager: Python deps, CLAD generate, verify.

.DESCRIPTION
  Run from anywhere. Locates the repo as the tree that contains
  tools/vizmanager/vizmanager/codec.py (this script lives in
  tools/vizmanager/scripts/).

  1. Finds Python 3.10+
  2. pip install -e tools/vizmanager (pygame, vispy, opencv-python, numpy)
  3. Emits generated/cladPython/ via generate_clad.py
  4. Verifies MessageViz imports
  5. Optionally adds inbound UDP 5252,5200 (needs elevation)
  6. Prints the exact run command, including --host-ip candidates

.PARAMETER Robot
  Robot LAN IPv4 to print in the run command (not required to set up).

.PARAMETER HostIp
  This PC's LAN IPv4 for RedirectViz. If omitted, candidates are listed.

.PARAMETER SkipPip
  Skip pip install (already installed).

.PARAMETER SkipGenerate
  Skip CLAD emit if generated/cladPython already exists.

.PARAMETER SkipFirewall
  Do not try New-NetFirewallRule.

.PARAMETER Python
  Python executable (default: py -3, then python, then python3).
#>
[CmdletBinding()]
param(
    [string]$Robot = "",
    [string]$HostIp = "",
    [switch]$SkipPip,
    [switch]$SkipGenerate,
    [switch]$SkipFirewall,
    [string]$Python = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    # tools/vizmanager/scripts -> repo root (same as generate_clad.py / codec.py)
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
    throw "Need Python 3.10+ on PATH (https://www.python.org/downloads/). Tick 'Add python.exe to PATH'."
}

function Invoke-Py {
    # Remaining args land in automatic $args ($Args is reserved and will not bind).
    param($Py)
    $all = @($Py.Prefix) + @($args)
    & $Py.Exe @all
    if ($LASTEXITCODE -ne 0) {
        throw "python failed ($LASTEXITCODE)"
    }
}

function Get-LanIpv4s {
    $ips = New-Object System.Collections.Generic.List[string]
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        ForEach-Object { [void]$ips.Add($_.IPAddress) }
    if ($ips.Count -eq 0) {
        try {
            $ips.Add((Get-NetIPConfiguration |
                Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq "Up" } |
                Select-Object -First 1).IPv4Address.IPAddress)
        } catch { }
    }
    return @($ips | Where-Object { $_ } | Select-Object -Unique)
}

$Root = Get-RepoRoot
$Codec = Join-Path $Root "tools\vizmanager\vizmanager\codec.py"
$Pkg = Join-Path $Root "tools\vizmanager"
$GenScript = Join-Path $Root "tools\vizmanager\scripts\generate_clad.py"
$MessageViz = Join-Path $Root "generated\cladPython\clad\vizInterface\messageViz.py"

Write-Host "Repo     $Root"
if (-not (Test-Path -LiteralPath $Codec)) {
    throw "codec.py not at $Codec - run this from the victor tree, not a copy of scripts/ alone."
}
if (-not (Test-Path -LiteralPath $GenScript)) {
    throw "missing $GenScript"
}

$Py = Get-PythonExe -Preferred $Python
Write-Host "Python   $($Py.Exe) $($Py.Prefix -join ' ')"
Invoke-Py $Py @("--version")

Push-Location $Pkg
try {
    if (-not $SkipPip) {
        Write-Host ""
        Write-Host "=== pip install -e .[test] (pygame, vispy, opencv-python, numpy) ==="
        Write-Host "Windows may lock Scripts\*.exe (pip .deleteme / Defender); retrying on failure."
        $pipOk = $false
        for ($i = 1; $i -le 8; $i++) {
            Write-Host "pip attempt $i/8"
            $all = @($Py.Prefix) + @("-m", "pip", "install", "-e", ".[test]", "--upgrade-strategy", "only-if-needed")
            & $Py.Exe @all
            if ($LASTEXITCODE -eq 0) { $pipOk = $true; break }
            Write-Warning ("pip exit {0}. Retry in {1}s (close other Python; Defender often locks the new .exe)." -f $LASTEXITCODE, (2 * $i))
            Start-Sleep -Seconds (2 * $i)
        }
        if (-not $pipOk) {
            throw "pip install failed after 8 tries (WinError 2 / .deleteme). Re-run; or exclude C:\Python311\Scripts from Defender."
        }
    }

    $needGen = -not (Test-Path -LiteralPath $MessageViz)
    if ($SkipGenerate -and $needGen) {
        throw "SkipGenerate set but $MessageViz is missing"
    }
    if (-not $SkipGenerate) {
        Write-Host ""
        Write-Host "=== generate CLAD Python -> generated\cladPython\ ==="
        Invoke-Py $Py @( $GenScript )
    }

    if (-not (Test-Path -LiteralPath $MessageViz)) {
        throw "expected $MessageViz after generate"
    }
    Write-Host "MessageViz $MessageViz"

    Write-Host ""
    Write-Host "=== import check (MessageViz + pygame + cv2) ==="
    # Single quotes only: PowerShell 5.1 strips " when building python -c's command line.
    $probe = @'
import sys
from vizmanager.codec import generated_available, MessageViz
if not generated_available() or MessageViz is None:
    sys.exit('codec.generated_available() is False - MessageViz not importable')
print('MessageViz', MessageViz)
import pygame
print('pygame', pygame.version.ver)
import cv2
print('cv2', cv2.__version__)
try:
    import vispy
    print('vispy', vispy.__version__)
except Exception as exc:
    print('vispy optional missing:', exc)
'@
    Invoke-Py $Py @("-c", $probe)
}
finally {
    Pop-Location
}

$fwCmd = "New-NetFirewallRule -DisplayName 'Vector Viz' -Direction Inbound -Protocol UDP -LocalPort 5252,5200 -Action Allow"
if (-not $SkipFirewall) {
    Write-Host ""
    Write-Host "=== inbound UDP 5252,5200 (this PC, not the robot) ==="
    try {
        $existing = Get-NetFirewallRule -DisplayName "Vector Viz" -ErrorAction SilentlyContinue
        if ($existing) {
            Write-Host "Firewall rule 'Vector Viz' already present"
        } else {
            New-NetFirewallRule -DisplayName "Vector Viz" -Direction Inbound -Protocol UDP -LocalPort 5252,5200 -Action Allow | Out-Null
            Write-Host "Added $fwCmd"
        }
    } catch {
        Write-Warning "Could not add the rule (run PowerShell as Administrator). Manual:"
        Write-Host "  $fwCmd"
        Write-Host "Also allow python.exe if Windows Defender prompts."
    }
}

# @() : PowerShell unwraps 1-element arrays (and StrictMode then has no .Count).
$lan = @(Get-LanIpv4s)
if (-not $HostIp -and $lan.Count -ge 1) {
    $HostIp = $lan[0]
}

Write-Host ""
Write-Host "=== run (from $Pkg) ==="
if ($lan.Count -gt 1) {
    Write-Host "LAN IPv4 candidates (pick the one the robot can ping, not VPN/Hyper-V/WSL):"
    $lan | ForEach-Object { Write-Host "  $_" }
} elseif ($HostIp) {
    Write-Host "Detected host IPv4: $HostIp"
} else {
    Write-Host "Could not detect a LAN IPv4 - pass -HostIp and --host-ip yourself."
}

$robotArg = if ($Robot) { $Robot } else { "ROBOT_LAN_IP" }
$hostArg = if ($HostIp) { $HostIp } else { "YOUR_LAN_IP" }
$prefix = @($Py.Prefix)
$pyLaunch = if ($prefix) { "$($Py.Exe) $($prefix -join ' ')" } else { $Py.Exe }

Write-Host ""
Write-Host "======================================"
Write-Host "Next Steps you need to manually run!"
Write-Host "======================================"
Write-Host ""
Write-Host "  cd $Pkg"
Write-Host "  $pyLaunch -m vizmanager --robot $robotArg --host-ip $hostArg"
Write-Host ""
Write-Host "On the robot (root, lasts until reboot) - UDP 5103 from this PC:"
Write-Host "  iptables -I INPUT -p udp --dport 5103 -s $hostArg -j ACCEPT"
Write-Host "Do not open 5252 on the robot."
Write-Host ""
Write-Host "Connect GETs :8888 consolevarset Viz=true; quit/Disconnect sets false."
Write-Host "If CAMERA stays empty with a live WORLD, :8888 failed; fallback:"
Write-Host "  curl `"http://${robotArg}:8888/consolevarset?key=Viz&value=true`""
Write-Host "Connect timeout: Windows inbound 5252+5200, or robot INPUT 5103, or wrong --host-ip."
Write-Host ""
Write-Host "Standalone exe (zip dist/VizManager for other PCs, no repo needed):"
Write-Host "  powershell -ExecutionPolicy Bypass -File tools\vizmanager\scripts\build_windows.ps1"
