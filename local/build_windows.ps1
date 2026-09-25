# Build ScadaT4bun local package (dist\) for Windows 10/11 x64. Run on Windows with Node + Yarn installed.
$ErrorActionPreference = "Stop"
$Local = $PSScriptRoot
$Root = Split-Path -Parent $Local
$Dist = Join-Path $Local "dist"
$PyVer = "3.11.9"
$MongoVer = "7.0.14"
$Tmp = Join-Path $env:TEMP "t4bun-build"

Remove-Item $Dist, $Tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $Dist, $Tmp | Out-Null

Write-Host "[1/4] Build frontend"
Push-Location (Join-Path $Root "frontend")
$env:REACT_APP_BACKEND_URL = ""
yarn install --frozen-lockfile
yarn build
Pop-Location
Copy-Item (Join-Path $Root "frontend\build") (Join-Path $Dist "frontend") -Recurse

Write-Host "[2/4] Copy backend"
New-Item -ItemType Directory (Join-Path $Dist "backend") | Out-Null
Get-ChildItem (Join-Path $Root "backend") -Filter *.py | Copy-Item -Destination (Join-Path $Dist "backend")
"launcher.py", "start-service.bat", "stop-service.bat", "README.md" | ForEach-Object { Copy-Item (Join-Path $Local $_) $Dist }

Write-Host "[3/4] Embedded Python $PyVer + dependencies"
$Py = Join-Path $Dist "python"
Invoke-WebRequest "https://www.python.org/ftp/python/$PyVer/python-$PyVer-embed-amd64.zip" -OutFile "$Tmp\py.zip"
Expand-Archive "$Tmp\py.zip" $Py
$Pth = Get-ChildItem $Py -Filter "python3*._pth" | Select-Object -First 1
Set-Content $Pth.FullName "$($Pth.BaseName).zip`r`n.`r`nLib\site-packages`r`nimport site" -Encoding ascii
Invoke-WebRequest "https://bootstrap.pypa.io/get-pip.py" -OutFile "$Tmp\get-pip.py"
& "$Py\python.exe" "$Tmp\get-pip.py" --no-warn-script-location
& "$Py\python.exe" -m pip install --no-warn-script-location -r (Join-Path $Local "requirements-local.txt")
if ($LASTEXITCODE -ne 0) { throw "pip install gagal" }

Write-Host "[4/4] MongoDB $MongoVer"
Invoke-WebRequest "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-$MongoVer.zip" -OutFile "$Tmp\mongo.zip"
Expand-Archive "$Tmp\mongo.zip" "$Tmp\mongo"
New-Item -ItemType Directory (Join-Path $Dist "mongodb\bin") -Force | Out-Null
Get-ChildItem "$Tmp\mongo" -Recurse -Filter mongod.exe | Select-Object -First 1 | Copy-Item -Destination (Join-Path $Dist "mongodb\bin")

Write-Host "Selesai: $Dist  (lanjutkan: iscc local\installer.iss)"
