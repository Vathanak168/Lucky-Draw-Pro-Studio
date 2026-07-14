#define MyAppName "Asta Studio"
#define MyAppVersion "6.0.0"
#define MyAppPublisher "Asta Studio"
#define MyAppExeName "Asta Studio.exe"

[Setup]
AppId={{6D81D7A9-4087-4FF2-9725-D922FA0F60A7}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppVerName={#MyAppName} {#MyAppVersion}
DefaultDirName={localappdata}\Programs\Asta Studio
DefaultGroupName=Asta Studio
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir=..\release
OutputBaseFilename=Asta-Studio-Setup-x64-{#MyAppVersion}
SetupIconFile=..\src\frontend\assets\asta-mark.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
AppMutex=Local\AstaStudio.DesktopApp
ChangesAssociations=yes
VersionInfoVersion={#MyAppVersion}.0
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
VersionInfoDescription=Asta Studio Installer

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Files]
Source: "..\dist\Asta Studio\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: not WebView2IsInstalled

[Icons]
Name: "{autoprograms}\Asta Studio"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\Asta Studio"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon

[Registry]
Root: HKA; Subkey: "Software\Classes\.asta"; ValueType: string; ValueData: "AstaStudio.Project"; Flags: uninsdeletevalue
Root: HKA; Subkey: "Software\Classes\AstaStudio.Project"; ValueType: string; ValueData: "Asta Studio Project"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\AstaStudio.Project\DefaultIcon"; ValueType: string; ValueData: "{app}\{#MyAppExeName},0"
Root: HKA; Subkey: "Software\Classes\AstaStudio.Project\shell\open\command"; ValueType: string; ValueData: """{app}\{#MyAppExeName}"" ""%1"""
Root: HKA; Subkey: "Software\Classes\.ldp\OpenWithProgids"; ValueType: string; ValueName: "AstaStudio.Project"; ValueData: ""; Flags: uninsdeletevalue

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft Edge WebView2 Runtime..."; Flags: waituntilterminated; Check: not WebView2IsInstalled
Filename: "{app}\{#MyAppExeName}"; Description: "Open Asta Studio"; Flags: nowait postinstall skipifsilent

[Code]
const
  WebView2RuntimeKey = 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function HasWebView2Version(RootKey: Integer; SubKey: String): Boolean;
var
  Version: String;
begin
  Result := RegQueryStringValue(RootKey, SubKey, 'pv', Version) and
            (Version <> '') and (Version <> '0.0.0.0');
end;

function WebView2IsInstalled: Boolean;
begin
  Result := HasWebView2Version(HKCU, WebView2RuntimeKey) or
            HasWebView2Version(HKLM32, WebView2RuntimeKey) or
            HasWebView2Version(HKLM64, WebView2RuntimeKey);
end;
