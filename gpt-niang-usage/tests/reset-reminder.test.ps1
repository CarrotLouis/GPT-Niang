param([Parameter(Mandatory=$true)][string]$StateFile,[Parameter(Mandatory=$true)][string]$WorkDirectory,[string]$PreviewFile)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Windows.Forms,System.Drawing
$app=Split-Path $PSScriptRoot -Parent
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $app 'runtime\update-common.ps1'),[Text.Encoding]::UTF8)))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $app 'runtime\supervisor-task.ps1'),[Text.Encoding]::UTF8)))
. ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $app 'runtime\reset-reminder.ps1'),[Text.Encoding]::UTF8)))
function Assert-Reset($Condition,[string]$Message){if(!$Condition){throw $Message}}
$script:dataDir=Join-Path ([IO.Path]::GetFullPath($WorkDirectory)) ('reset-panel-test-'+[Guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $script:dataDir -Force
$cache=Join-Path $script:dataDir 'reset-reminder.json'
$state=Read-WidgetUpdateJson $StateFile
$state.ok=$true;$state.stale=$false;$state.plan=$null;$state.notifications=@();$state.nextAllowedAt=0
Write-WidgetSupervisorJson $cache $state
$script:resetPanel=New-WidgetResetPanel;$script:resetUi=@{}
foreach($name in @('Connection','LastReset','NextReset','Article','PlanBody','Checked','Notify','Check','Original','Source')){$script:resetUi[$name]=$script:resetPanel.FindName($name);Assert-Reset ($script:resetUi[$name]) ('Missing panel control: '+$name)}
$script:resetProcess=$null;$script:resetNotifications=$true;$script:resetLastTick=0;$script:resetNextCheck=[long]::MaxValue
$script:resetUi.Notify.IsChecked=$true
$script:resetNotify=[pscustomobject]@{Count=0;LastTitle='';LastBody=''}
$script:resetNotify|Add-Member -MemberType ScriptMethod -Name ShowBalloonTip -Value {param($ms,$title,$body,$icon)$this.Count++;$this.LastTitle=$title;$this.LastBody=$body}
try {
  Update-WidgetResetPanel
  Assert-Reset ($script:resetUi.NextReset.Text-eq '尚未公布') 'Unknown plan must remain unpublished'
  Assert-Reset ($script:resetUi.LastReset.Text-eq $state.lastResetBeijing) 'Confirmed source time differs'
  Assert-Reset ($script:resetUi.Connection.Text.Contains('每 5 分钟')) 'Polling cadence missing'
  Assert-Reset ($script:resetUi.Source.Content.Contains('codex-reset.com')) 'Source credit missing on panel'
  foreach($width in @(650,550)){
    $root=$script:resetPanel.Content
    $root.Measure([Windows.Size]::new($width,560));$root.Arrange([Windows.Rect]::new(0,0,$width,560));$root.UpdateLayout()
    foreach($name in @('LastReset','NextReset','Notify','Check','Original','Source')){
      $control=$script:resetUi[$name];$origin=$control.TranslatePoint([Windows.Point]::new(0,0),$root)
      Assert-Reset ($origin.Y+$control.ActualHeight-le $root.ActualHeight+1) ($name+' falls below panel')
      Assert-Reset ($origin.X+$control.ActualWidth-le $root.ActualWidth+1) ($name+' falls outside panel')
    }
  }
  if($PreviewFile){
    $root=$script:resetPanel.Content;$root.Measure([Windows.Size]::new(650,560));$root.Arrange([Windows.Rect]::new(0,0,650,560));$root.UpdateLayout()
    $render=[Windows.Media.Imaging.RenderTargetBitmap]::new(650,560,96,96,[Windows.Media.PixelFormats]::Pbgra32)
    $background=New-Object Windows.Media.DrawingVisual;$drawing=$background.RenderOpen();$drawing.DrawRectangle($script:resetPanel.Background,$null,[Windows.Rect]::new(0,0,650,560));$drawing.Close()
    $render.Render($background);$render.Render($root)
    $encoder=New-Object Windows.Media.Imaging.PngBitmapEncoder;$encoder.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($render))
    $stream=[IO.File]::Create([IO.Path]::GetFullPath($PreviewFile));try{$encoder.Save($stream)}finally{$stream.Dispose()}
  }
  $clock=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $state.notifications=@(@{id='test-new-reset';title='Test reset';body='Only a test';at=$clock});Write-WidgetSupervisorJson $cache $state
  Tick-WidgetResetReminder $clock;Tick-WidgetResetReminder ($clock+1000)
  Assert-Reset ($script:resetNotify.Count-eq 1) 'Duplicate notification across ticks'
  Assert-Reset ($script:resetNotify.LastBody.Contains('codex-reset.com')) 'Notification lacks data attribution'
  $state.ok=$false;$state.stale=$true;$state.notifications+=@{id='test-pending-reset';title='Pending';body='Pending';at=$clock};Write-WidgetSupervisorJson $cache $state
  Tick-WidgetResetReminder ($clock+2000)
  Assert-Reset ($script:resetNotify.Count-eq 1) 'Stale data triggered alert'
  Assert-Reset ($script:resetUi.Connection.Text.Contains('保留')) 'Failure hides cached-state status'
  $state.ok=$true;$state.stale=$false;Write-WidgetSupervisorJson $cache $state
  Tick-WidgetResetReminder ($clock+3000)
  Assert-Reset ($script:resetNotify.Count-eq 2) 'Deferred fresh alert was lost during failure'
  $script:resetNotifications=$false;$state.notifications+=@{id='test-muted';title='Muted';body='Muted';at=$clock};Write-WidgetSupervisorJson $cache $state
  Tick-WidgetResetReminder ($clock+4000);$script:resetNotifications=$true;Tick-WidgetResetReminder ($clock+5000)
  Assert-Reset ($script:resetNotify.Count-eq 2) 'Enabling reminders replays muted history'
  . ([ScriptBlock]::Create([IO.File]::ReadAllText((Join-Path $app 'runtime\update-ui.ps1'),[Text.Encoding]::UTF8)))
  $script:appDir=$app;$script:settingsMenuUi=@{};Initialize-WidgetUpdater
  $custom=Read-WidgetUpdateJson (Join-Path $app 'local-customization.json')
  Assert-Reset ($custom.protectFromUpstreamOverwrite) 'Local-build overwrite protection is missing'
  'Reset panel layout, source credit, stale cache and tray deduplication: PASS'
}finally{$script:resetPanel.Close()}
