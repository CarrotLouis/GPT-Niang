$ErrorActionPreference='Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'runtime\install-preflight.ps1')
$root=Join-Path ([IO.Path]::GetTempPath()) ('gn-cli-'+[Guid]::NewGuid().ToString('N'))
$null=[IO.Directory]::CreateDirectory($root)
$checks=0
function Assert([bool]$Value,[string]$Name){if(!$Value){throw $Name};$script:checks++}
function Reject([scriptblock]$Action,[string]$Name){try{& $Action|Out-Null}catch{$script:checks++;return};throw $Name}
try{
 $exe=Join-Path $root 'modern.exe'
 Add-Type -OutputAssembly $exe -OutputType ConsoleApplication -TypeDefinition @'
using System;using System.IO;using System.Linq;using System.Threading;
public static class FakeCodex {
 public static int Main(string[] args){
  string kind=Path.GetFileNameWithoutExtension(System.Diagnostics.Process.GetCurrentProcess().MainModule.FileName);
  if(args.Contains("sleep")){Thread.Sleep(30000);return 0;}
  if(args.Contains("--help")){if(kind=="old"){Console.WriteLine("unsupported --json");return 2;}Console.WriteLine("options: --json --marketplace");return 0;}
  if(!args.Contains("--marketplace")){Thread.Sleep(30000);return 5;}
  string version=kind=="wrong"?"1.3.4":"1.3.5";
  bool enabled=kind!="disabled";
  string entry="{\"pluginId\":\"gpt-niang-usage@gpt-niang-local\",\"version\":\""+version+"\",\"installed\":true,\"enabled\":"+enabled.ToString().ToLowerInvariant()+"}";
  Console.WriteLine("{\"installed\":["+entry+(kind=="duplicate"?","+entry:"")+"]}");return 0;
 }
}
'@ -ReferencedAssemblies 'System.dll','System.Core.dll'
 foreach($name in @('old','wrong','disabled','duplicate')){Copy-Item -LiteralPath $exe -Destination (Join-Path $root ($name+'.exe'))}
 $old=Join-Path $root 'old.exe'
 Assert (!(Test-WidgetCodexCapabilities $old)) 'Old CLI was accepted'
 Assert (Test-WidgetCodexCapabilities $exe) 'Compatible CLI was rejected'
 Assert ((Resolve-WidgetInstallCodex -Candidates @($old,$exe))-eq $exe) 'Incompatible first candidate did not fall through'
 Assert ((Resolve-WidgetInstallCodex -Candidates @((Join-Path $root 'absent.exe'),$exe,$exe))-eq $exe) 'Missing/duplicate candidates changed selection'
 Reject {Resolve-WidgetInstallCodex -Candidates @($old)} 'Only incompatible candidates should fail'
 $watch=[Diagnostics.Stopwatch]::StartNew()
 Assert-WidgetPluginRegistration $exe '1.3.5'
 Assert ($watch.Elapsed.TotalSeconds-lt 8) 'Plugin verification enumerated all marketplaces'
 foreach($name in @('wrong','disabled','duplicate')){Reject {Assert-WidgetPluginRegistration (Join-Path $root ($name+'.exe')) '1.3.5'} ($name+' registration accepted')}
 Reject {Invoke-WidgetCodexReadOnly $exe 'sleep' 100} 'Read-only CLI timeout not enforced'
 $leaked=@(Get-CimInstance Win32_Process -Filter "Name='modern.exe'" | Where-Object {$_.ExecutablePath-eq $exe})
 Assert ($leaked.Count-eq 0) 'Timed-out CLI was left running'
 Write-Output ('PASS: '+$checks+' installer capability, fallback, scoped verification and timeout assertions')
}finally{
 $resolved=[IO.Path]::GetFullPath($root)
 if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe CLI fixture cleanup'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
