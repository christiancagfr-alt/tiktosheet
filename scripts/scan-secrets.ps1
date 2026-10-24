# Heuristic inventory only. Never print matching secret values. ZIPs are read in memory, not extracted.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$rootPath = (Get-Location).Path
$findings = [System.Collections.Generic.List[object]]::new()
$inventory = [System.Collections.Generic.List[object]]::new()
$rules = @{
  PrivateKey = '-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'
  GoogleApiKey = 'AIza[0-9A-Za-z_-]{30,}'
  CloudAccessKey = '(?:AKIA|ASIA)[A-Z0-9]{16}'
  GitHubToken = '(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'
  LiteralConnectionKey = '#key=[a-fA-F0-9]{32,}'
  LiteralSecret = '(?i)(?:SYNC_TOKEN|SYNC_KEY|password|api_key|access_token|private_key|token)\s*[:=]\s*["''][A-Za-z0-9_+/=-]{20,}["'']'
  CredentialUrl = '(?i)(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|https?)://[^\s/:]+:[^\s/@]+@'
  Webhook = 'https://(?:hooks\.slack\.com/services|discord(?:app)?\.com/api/webhooks)/[^\s"'']+'
}
function Inspect-Text([string]$path,[string]$text) {
  $lines = $text -split "`n"
  foreach($rule in $rules.GetEnumerator()) {
    for($i=0; $i -lt $lines.Length; $i++) {
      if($lines[$i] -match $rule.Value) { $findings.Add([pscustomobject]@{path=$path;line=$i+1;rule=$rule.Key}) }
    }
  }
}
$files = Get-ChildItem -LiteralPath $rootPath -Recurse -Force -File | Where-Object { $_.FullName -notmatch '[\\/](?:\.tools|\.git|node_modules|audit)[\\/]' }
foreach($file in $files) {
  $relative = [System.IO.Path]::GetRelativePath($rootPath,$file.FullName)
  $inventory.Add([pscustomobject]@{path=$relative;bytes=$file.Length;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash})
  if($file.Extension -eq '.zip') {
    $zip = [System.IO.Compression.ZipFile]::OpenRead($file.FullName)
    try {
      foreach($entry in $zip.Entries) {
        if($entry.FullName -match '(^|[/\\])\.\.?([/\\]|$)|^[/\\]|^[A-Za-z]:') { $findings.Add([pscustomobject]@{path="$relative!$($entry.FullName)";line=0;rule='UnsafeZipPath'}) }
        if($entry.FullName -match '(?i)(^|[/\\])\.env($|\.(?!example))|\.(?:pem|p12|pfx|key)$|service.account.*\.json$') { $findings.Add([pscustomobject]@{path="$relative!$($entry.FullName)";line=0;rule='SensitiveFilename'}) }
        if($entry.Length -gt 2097152) { $findings.Add([pscustomobject]@{path="$relative!$($entry.FullName)";line=0;rule='OversizeEntryNotScanned'});continue }
        if($entry.FullName -match '\.(?:png|jpg|jpeg|gif|ico|zip|exe)$' -or $entry.Length -eq 0) { continue }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { Inspect-Text "$relative!$($entry.FullName)" $reader.ReadToEnd() } finally { $reader.Dispose() }
      }
    } finally { $zip.Dispose() }
  } elseif($file.Extension -notmatch '^\.(?:png|jpg|jpeg|gif|ico|exe)$' -and $file.Length -le 2097152) {
    Inspect-Text $relative ([System.IO.File]::ReadAllText($file.FullName))
    if($file.Name -match '^\.env($|\.(?!example))|\.(pem|p12|pfx|key)$|service.account.*\.json$') { $findings.Add([pscustomobject]@{path=$relative;line=0;rule='SensitiveFilename'}) }
  }
}
$report = [pscustomobject]@{files=$inventory.Count;archives=@($files | Where-Object Extension -eq '.zip').Count;findings=@($findings);inventory=@($inventory)}
New-Item -ItemType Directory -Path 'audit' -Force | Out-Null
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath 'audit/secret-scan.json' -Encoding utf8
[pscustomobject]@{files=$report.files;archives=$report.archives;candidateCount=$findings.Count;findings=@($findings)} | ConvertTo-Json -Depth 5
