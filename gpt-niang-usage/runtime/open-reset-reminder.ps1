$ErrorActionPreference='Stop'
$app=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$config=Get-Content -LiteralPath (Join-Path $app 'installation.json') -Raw -Encoding UTF8|ConvertFrom-Json
. (Join-Path $PSScriptRoot 'supervisor-task.ps1')
. (Join-Path $PSScriptRoot 'update-common.ps1')
Start-WidgetSupervisorTask $app
& $config.nodePath (Join-Path $PSScriptRoot 'control.mjs') resets
if($LASTEXITCODE-ne 0){throw 'Cannot open reset reminder'}
