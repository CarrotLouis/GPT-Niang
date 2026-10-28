function Read-WidgetResetJson([string]$File) {
  try{return Read-WidgetUpdateJson $File}catch{return $null}
}
function Initialize-WidgetResetReminder {
  $script:resetProcess=$null;$script:resetProcessAt=0;$script:resetNextCheck=0;$script:resetLastTick=0;$script:resetPanel=$null;$script:resetUi=@{}
  $preferences=Read-WidgetResetJson (Join-Path $script:dataDir 'reset-reminder-preferences.json')
  $script:resetNotifications=!($preferences -and $preferences.enabled-eq $false)
  $script:resetNotify=New-Object System.Windows.Forms.NotifyIcon
  $script:resetNotify.Icon=[Drawing.SystemIcons]::Information;$script:resetNotify.Text='GPT 娘 · 额度重置提醒';$script:resetNotify.Visible=$true
  $script:resetNotify.Add_BalloonTipClicked({Open-WidgetResetPanel})
  $script:resetNotify.Add_DoubleClick({Open-WidgetResetPanel})
  $tray=New-Object System.Windows.Forms.ContextMenuStrip
  $open=$tray.Items.Add('查看额度重置公告');$open.Add_Click({Open-WidgetResetPanel})
  $script:resetNotify.ContextMenuStrip=$tray
}
function New-WidgetResetPanel {
  return [Windows.Markup.XamlReader]::Parse(@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
 Title="GPT 娘 · 额度重置提醒" Width="650" Height="580" MinWidth="550" MinHeight="490" FontFamily="Microsoft YaHei UI" FontSize="13"
 Background="#FAF8FD" Foreground="#554464" WindowStartupLocation="CenterScreen" ShowInTaskbar="False">
 <Window.Resources>
  <Style TargetType="Button"><Setter Property="Padding" Value="12,7"/><Setter Property="Margin" Value="0,0,9,0"/><Setter Property="Background" Value="#F0E8F8"/><Setter Property="BorderBrush" Value="#DFD1EC"/><Setter Property="Foreground" Value="#77549B"/><Setter Property="Cursor" Value="Hand"/></Style>
 </Window.Resources>
 <Grid Margin="24,20,24,18">
  <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="Auto"/><RowDefinition Height="*"/><RowDefinition Height="Auto"/></Grid.RowDefinitions>
  <StackPanel>
   <TextBlock Text="重置日期 · Tibo" FontSize="23" FontWeight="SemiBold" Foreground="#8960AF"/>
   <TextBlock x:Name="Connection" Text="正在读取重置公告…" Margin="0,6,0,16" Foreground="#A28DAF"/>
  </StackPanel>
  <StackPanel Grid.Row="1">
   <Border CornerRadius="12" Background="White" BorderBrush="#E9DFF1" BorderThickness="1" Padding="16,13" Margin="0,0,0,10">
    <StackPanel><TextBlock Text="最近已核实的全局重置" Foreground="#A48ABB"/><TextBlock x:Name="LastReset" Text="正在读取…" TextWrapping="Wrap" FontSize="19" FontWeight="SemiBold" Foreground="#8960AF" Margin="0,5,0,0"/></StackPanel>
   </Border>
   <Border CornerRadius="12" Background="#F0E8F8" Padding="16,13" Margin="0,0,0,16">
    <StackPanel><TextBlock Text="下次重置计划 · 公告目标，实际到账待确认" Foreground="#A48ABB"/><TextBlock x:Name="NextReset" Text="尚未公布" TextWrapping="Wrap" FontSize="18" FontWeight="SemiBold" Foreground="#8960AF" Margin="0,5,0,0"/></StackPanel>
   </Border>
  </StackPanel>
  <ScrollViewer Grid.Row="2" VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled" Margin="0,0,0,12">
   <StackPanel>
    <TextBlock x:Name="ArticleTitle" Text="核实记录与原公告" FontWeight="SemiBold" FontSize="14" Margin="0,0,0,8"/>
    <TextBlock x:Name="Article" Text="等待首次检测。" TextWrapping="Wrap" LineHeight="22"/>
    <TextBlock x:Name="PlanBody" TextWrapping="Wrap" LineHeight="22" Margin="0,12,0,0"/>
    <TextBlock x:Name="Checked" Foreground="#A28DAF" Margin="0,14,0,0" TextWrapping="Wrap"/>
   </StackPanel>
  </ScrollViewer>
  <StackPanel Grid.Row="3">
   <CheckBox x:Name="Notify" Content="新公告、确认重置及公告目标临近时提醒" Foreground="#8960AF" Margin="0,0,0,12"/>
   <TextBlock Text="公告与实际到账可能有延迟，请以当前账号额度为准。" TextWrapping="Wrap" Foreground="#A28DAF" FontSize="12" Margin="0,0,0,12"/>
   <WrapPanel>
    <Button x:Name="Check" Content="立即检测"/>
    <Button x:Name="Original" Content="查看 X 原帖"/>
    <Button x:Name="Source" Content="数据：codex-reset.com（第三方）"/>
   </WrapPanel>
  </StackPanel>
 </Grid>
</Window>
'@)
}
function Open-WidgetResetPanel {
  if($script:resetPanel -and $script:resetPanel.IsVisible){$script:resetPanel.Activate()|Out-Null;return}
  $script:resetPanel=New-WidgetResetPanel;$script:resetUi=@{}
  foreach($name in @('Connection','LastReset','NextReset','ArticleTitle','Article','PlanBody','Checked','Notify','Check','Original','Source')){$script:resetUi[$name]=$script:resetPanel.FindName($name)}
  if($script:window -and $script:window.IsVisible){$script:resetPanel.Owner=$script:window}
  $script:resetUi.Notify.IsChecked=$script:resetNotifications
  $script:resetUi.Notify.Add_Click({$script:resetNotifications=[bool]$script:resetUi.Notify.IsChecked;Write-WidgetSupervisorJson (Join-Path $script:dataDir 'reset-reminder-preferences.json') @{enabled=$script:resetNotifications}})
  $script:resetUi.Check.Add_Click({Start-WidgetResetCheck -Manual})
  $script:resetUi.Original.Add_Click({$state=Read-WidgetResetJson (Join-Path $script:dataDir 'reset-reminder.json');$url=if($state.plan.url){$state.plan.url}else{$state.event.url};if($url-match '^https://(x\.com|twitter\.com)/thsottiaux/status/\d+$'){Start-Process $url}})
  $script:resetUi.Source.Add_Click({Start-Process 'https://codex-reset.com/zh/'})
  $script:resetPanel.Add_Closed({Write-WidgetSupervisorJson (Join-Path $script:dataDir 'reset-reminder-ui.json') @{pid=$PID;visible=$false;at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()};$script:resetPanel=$null;$script:resetUi=@{}})
  Update-WidgetResetPanel
  $script:resetPanel.Show();$script:resetPanel.Activate()|Out-Null
  Write-WidgetSupervisorJson (Join-Path $script:dataDir 'reset-reminder-ui.json') @{pid=$PID;visible=[bool]$script:resetPanel.IsVisible;at=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
  Start-WidgetResetCheck
}
function Update-WidgetResetPanel {
  if(!$script:resetUi.Connection){return}
  $state=Read-WidgetResetJson (Join-Path $script:dataDir 'reset-reminder.json')
  $busy=$script:resetProcess -and !$script:resetProcess.HasExited
  $script:resetUi.Connection.Text=if($busy){'正在检测…'}elseif(!$state){'等待首次检测'}elseif(!$state.ok){'连接失败 · 保留上次成功数据，稍后重试'}elseif($state.stale){'来源数据过旧 · 暂停新提醒'}else{'已连接 · 运行期间每 5 分钟检查'}
  $script:resetUi.LastReset.Text=if($state.lastResetBeijing){$state.lastResetBeijing}else{'暂无已核实记录'}
  $script:resetUi.NextReset.Text=if($state.plan){$state.plan.deadlineBeijing}else{'尚未公布'}
  $script:resetUi.Article.Text=if($state.event){$state.event.summary}else{'暂无已核实的公告；不会根据模型预测推断重置。'}
  $script:resetUi.PlanBody.Text=if($state.plan){'最新计划：'+$state.plan.summary}else{''}
  $checked=if($state.checkedAt){[DateTimeOffset]::FromUnixTimeMilliseconds([long]$state.checkedAt).ToOffset([TimeSpan]::FromHours(8)).ToString('MM-dd HH:mm:ss')+' 北京时间'}else{'尚未成功检测'}
  $script:resetUi.Checked.Text='上次成功检测：'+$checked
  $script:resetUi.Original.IsEnabled=[bool]($state.event.url -or $state.plan.url)
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $script:resetUi.Check.IsEnabled=!$busy -and (!$state -or $now-ge [long]$state.nextAllowedAt)
  $script:resetUi.Check.ToolTip=if($state -and $now-lt [long]$state.nextAllowedAt){'为遵守来源限流，每分钟最多检测一次。'}else{'读取公开公告，不发送账号或额度数据。'}
}
function Start-WidgetResetCheck([switch]$Manual) {
  if($script:resetProcess -and !$script:resetProcess.HasExited){return}
  $now=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $state=Read-WidgetResetJson (Join-Path $script:dataDir 'reset-reminder.json')
  if($state -and ($now-lt [long]$state.nextAllowedAt -or (!$Manual -and $now-lt [long]$state.nextCheckAt))){Update-WidgetResetPanel;return}
  if($script:resetProcess){$script:resetProcess.Dispose();$script:resetProcess=$null}
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$script:config.nodePath;$info.Arguments='"'+(Join-Path $script:appDir 'runtime\reset-reminder.mjs')+'" "'+$script:configPath+'"'+$(if($Manual){' --manual'}else{''})
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $process=New-Object Diagnostics.Process;$process.StartInfo=$info
  try{if(!$process.Start()){throw 'Cannot start reminder reader'};$script:resetProcess=$process;$script:resetProcessAt=$now;$script:resetNextCheck=$now+300000}
  catch{$process.Dispose();$script:resetNextCheck=$now+300000}
  Update-WidgetResetPanel
}
function Tick-WidgetResetReminder([long]$Now) {
  if($Now-$script:resetLastTick-lt 1000){return};$script:resetLastTick=$Now
  if($script:resetProcess){
    if(!$script:resetProcess.HasExited -and $Now-$script:resetProcessAt-gt 35000){$script:resetProcess.Kill()}
    if($script:resetProcess.HasExited){$script:resetProcess.Dispose();$script:resetProcess=$null}
  }
  if(!$script:resetProcess -and $Now-ge $script:resetNextCheck){Start-WidgetResetCheck}
  $state=Read-WidgetResetJson (Join-Path $script:dataDir 'reset-reminder.json')
  $file=Join-Path $script:dataDir 'reset-reminder-notified.json'
  $history=Read-WidgetResetJson $file;$ids=@($history.ids)
  $new=@($state.notifications|Where-Object{$_ -and $_.id -and $_.id-notin $ids})
  if($new.Count -and ((!$script:resetNotifications) -or ($state.ok -and !$state.stale))){
    $latest=$new[-1]
    if($script:resetNotifications -and $state.ok -and !$state.stale){$script:resetNotify.ShowBalloonTip(12000,[string]$latest.title,([string]$latest.body+"`n数据：codex-reset.com（第三方）"),[Windows.Forms.ToolTipIcon]::Info)}
    $ids=@($ids+@($new|ForEach-Object{[string]$_.id})|Where-Object{$_}|Select-Object -Last 128)
    Write-WidgetSupervisorJson $file @{ids=$ids}
  }
  Update-WidgetResetPanel
}
function Stop-WidgetResetReminder {
  if($script:resetProcess){try{if(!$script:resetProcess.HasExited){$script:resetProcess.Kill()}}catch{};$script:resetProcess.Dispose();$script:resetProcess=$null}
  if($script:resetPanel){$script:resetPanel.Close()}
  if($script:resetNotify){$script:resetNotify.Visible=$false;$script:resetNotify.Dispose();$script:resetNotify=$null}
}
