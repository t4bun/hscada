; Inno Setup 6 script - Scada by T4bun (run build_windows.ps1 first)
#define AppName "Scada by T4bun"
#define AppVersion "1.0.0"
#define HttpPort "8080"

[Setup]
AppId=ScadaT4bun.SCADA.Local
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=T4bun
DefaultDirName={autopf}\ScadaT4bun
DefaultGroupName=ScadaT4bun
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=ScadaT4bun-Setup-{#AppVersion}
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "dist\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[INI]
Filename: "{commondesktop}\Scada by T4bun.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{#HttpPort}"
Filename: "{group}\Scada by T4bun.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{#HttpPort}"

[Icons]
Name: "{group}\Hentikan Scada by T4bun"; Filename: "{app}\stop-service.bat"
Name: "{group}\Jalankan Scada by T4bun"; Filename: "schtasks"; Parameters: "/Run /TN ""ScadaT4bun"""
Name: "{group}\Login Admin (LOGIN-ADMIN.txt)"; Filename: "{commonappdata}\ScadaT4bun\LOGIN-ADMIN.txt"
Name: "{commondesktop}\Scada by T4bun Kiosk"; Filename: "{commonpf32}\Microsoft\Edge\Application\msedge.exe"; Parameters: "--kiosk ""http://localhost:{#HttpPort}/?kiosk=1"" --edge-kiosk-type=fullscreen --no-first-run"; Comment: "Runtime operator full-screen"
Name: "{group}\Scada by T4bun Kiosk"; Filename: "{commonpf32}\Microsoft\Edge\Application\msedge.exe"; Parameters: "--kiosk ""http://localhost:{#HttpPort}/?kiosk=1"" --edge-kiosk-type=fullscreen --no-first-run"

[Run]
Filename: "{app}\python\python.exe"; Parameters: """{app}\launcher.py"" --init"; Flags: runhidden waituntilterminated; StatusMsg: "Membuat konfigurasi..."
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""ScadaT4bun"""; Flags: runhidden waituntilterminated
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""ScadaT4bun"" dir=in action=allow protocol=TCP localport={#HttpPort}"; Flags: runhidden waituntilterminated; StatusMsg: "Membuka port firewall..."
Filename: "schtasks"; Parameters: "/Create /F /TN ""ScadaT4bun"" /SC ONSTART /DELAY 0000:30 /RU SYSTEM /RL HIGHEST /TR ""\""{app}\start-service.bat\"""""; Flags: runhidden waituntilterminated; StatusMsg: "Mendaftarkan autostart..."
Filename: "schtasks"; Parameters: "/Run /TN ""ScadaT4bun"""; Flags: runhidden waituntilterminated; StatusMsg: "Menjalankan ScadaT4bun..."
Filename: "{commonappdata}\ScadaT4bun\LOGIN-ADMIN.txt"; Description: "Lihat login admin"; Flags: shellexec postinstall skipifsilent skipifdoesntexist
Filename: "http://localhost:{#HttpPort}"; Description: "Buka Scada by T4bun di browser"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "{app}\stop-service.bat"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "schtasks"; Parameters: "/Delete /F /TN ""ScadaT4bun"""; Flags: runhidden waituntilterminated; RunOnceId: "DelTask"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""ScadaT4bun"""; Flags: runhidden waituntilterminated; RunOnceId: "DelFw"
