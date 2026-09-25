; Inno Setup 6 script - NusaHMI SCADA Lokal (run build_windows.ps1 first)
#define AppName "NusaHMI SCADA Lokal"
#define AppVersion "1.0.0"
#define HttpPort "8080"

[Setup]
AppId=NusaHMI.SCADA.Local
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=NusaHMI
DefaultDirName={autopf}\NusaHMI
DefaultGroupName=NusaHMI
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=NusaHMI-Setup-{#AppVersion}
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
Filename: "{commondesktop}\NusaHMI SCADA.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{#HttpPort}"
Filename: "{group}\NusaHMI SCADA.url"; Section: "InternetShortcut"; Key: "URL"; String: "http://localhost:{#HttpPort}"

[Icons]
Name: "{group}\Hentikan NusaHMI"; Filename: "{app}\stop-service.bat"
Name: "{group}\Jalankan NusaHMI"; Filename: "schtasks"; Parameters: "/Run /TN ""NusaHMI"""
Name: "{group}\Login Admin (LOGIN-ADMIN.txt)"; Filename: "{commonappdata}\NusaHMI\LOGIN-ADMIN.txt"

[Run]
Filename: "{app}\python\python.exe"; Parameters: """{app}\launcher.py"" --init"; Flags: runhidden waituntilterminated; StatusMsg: "Membuat konfigurasi..."
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""NusaHMI"""; Flags: runhidden waituntilterminated
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""NusaHMI"" dir=in action=allow protocol=TCP localport={#HttpPort}"; Flags: runhidden waituntilterminated; StatusMsg: "Membuka port firewall..."
Filename: "schtasks"; Parameters: "/Create /F /TN ""NusaHMI"" /SC ONSTART /DELAY 0000:30 /RU SYSTEM /RL HIGHEST /TR ""\""{app}\start-service.bat\"""""; Flags: runhidden waituntilterminated; StatusMsg: "Mendaftarkan autostart..."
Filename: "schtasks"; Parameters: "/Run /TN ""NusaHMI"""; Flags: runhidden waituntilterminated; StatusMsg: "Menjalankan NusaHMI..."
Filename: "{commonappdata}\NusaHMI\LOGIN-ADMIN.txt"; Description: "Lihat login admin"; Flags: shellexec postinstall skipifsilent skipifdoesntexist
Filename: "http://localhost:{#HttpPort}"; Description: "Buka NusaHMI di browser"; Flags: shellexec postinstall skipifsilent nowait

[UninstallRun]
Filename: "{app}\stop-service.bat"; Flags: runhidden waituntilterminated; RunOnceId: "StopSvc"
Filename: "schtasks"; Parameters: "/Delete /F /TN ""NusaHMI"""; Flags: runhidden waituntilterminated; RunOnceId: "DelTask"
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""NusaHMI"""; Flags: runhidden waituntilterminated; RunOnceId: "DelFw"
