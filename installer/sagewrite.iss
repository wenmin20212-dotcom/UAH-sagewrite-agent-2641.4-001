#ifndef Payload
 #error Supply Payload
#endif
#ifndef Output
 #error Supply Output
#endif
[Setup]
AppId=UAH-SageWrite-2641.4-001
AppName=作家 Agent SageWrite 2641.4-001
AppVersion=0.1.3
AppPublisher=wenmin20212-dotcom
DefaultDirName={localappdata}\Programs\UAH-SageWrite-2641.4-001
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableProgramGroupPage=yes
OutputDir={#Output}
OutputBaseFilename=SageWrite-Agent-2641.4-001-Setup-0.1.3
SetupIconFile={#Payload}\assets\agent.ico
UninstallDisplayIcon={app}\assets\agent.ico
Compression=lzma2/fast
SolidCompression=yes
CloseApplications=no
RestartApplications=no
LicenseFile={#Payload}\LICENSE-SageWrite
[Languages]
Name: "chinesesimp"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"
[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
[Icons]
Name: "{autodesktop}\作家 Agent SageWrite 2641.4-001"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\agent.ico"
Name: "{autoprograms}\作家 Agent SageWrite 2641.4-001"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\agent.ico"
[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\launch.ps1"""; WorkingDir: "{app}"; Description: "启动作家 Agent"; Flags: nowait postinstall skipifsilent
[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if FileExists(ExpandConstant('{app}\agent.json')) then
    Result := 'Existing Agent detected. Use the matching Upgrade.zip, or choose a new directory. Model settings and manuscripts must be preserved.';
end;
