$ErrorActionPreference='Stop'
$localNode=Join-Path $PSScriptRoot '../.tools/node-v24.22.1/node.exe'
$verifyNode=if(Test-Path -LiteralPath $localNode){(Resolve-Path -LiteralPath $localNode).Path}else{(Get-Command node -ErrorAction Stop).Source}
Push-Location (Join-Path $PSScriptRoot '..')
try {
  & $verifyNode scripts/runtime-check.js
  if($LASTEXITCODE -ne 0){throw 'Node runtime check failed'}
  & $verifyNode scripts/build-apps-script.js
  if($LASTEXITCODE -ne 0){throw 'Build failed'}
  & $verifyNode scripts/check.js
  if($LASTEXITCODE -ne 0){throw 'Syntax check failed'}
  & $verifyNode --test 'test/*.test.js'
  if($LASTEXITCODE -ne 0){throw 'Tests failed'}
} finally {Pop-Location}
