$ErrorActionPreference = 'Stop'
$node = Join-Path $PSScriptRoot 'runtime/node.exe'
if (-not (Test-Path -LiteralPath $node)) { $node = 'node' }
& $node (Join-Path $PSScriptRoot 'scripts/launch.cjs')
