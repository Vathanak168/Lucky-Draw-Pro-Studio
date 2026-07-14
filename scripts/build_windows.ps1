$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
$spec = Join-Path $projectRoot 'packaging\asta_studio.spec'

if (-not (Test-Path -LiteralPath $python)) {
    throw 'The project virtual environment was not found.'
}

Push-Location $projectRoot
try {
    & $python -m PyInstaller --noconfirm --clean $spec
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller failed with exit code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

Write-Host "Asta Studio build created at: $projectRoot\dist\Asta Studio\Asta Studio.exe"
