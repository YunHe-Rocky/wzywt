param(
  [string]$VoiceName = "Microsoft Kangkang",
  [int]$Rate = 1
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$outputDirectory = Join-Path (Split-Path -Parent $scriptDirectory) "narration"
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null

$segments = @(
  @{ File = "01-hook.wav"; Text = "十个人，一场内战。怎么分队，才够公平？" },
  @{ File = "02-pain.wav"; Text = "靠猜，容易撞位置；凭感觉，又总有人不服。" },
  @{ File = "03-position.wav"; Text = "王者演武堂，为王者荣耀好友内战而生。" },
  @{ File = "04-profile.wav"; Text = "记录分路偏好、段位实力和英雄战力，让每一位玩家，都站上更适合自己的位置。" },
  @{ File = "05-balance.wav"; Text = "确定性均衡分队，兼顾位置与实力。红蓝双方，有来有回，赢得更痛快。" },
  @{ File = "06-room.wav"; Text = "创建房间、分享房间号、快速集结；临时补位，也能轻松加入。" },
  @{ File = "07-prepare.wav"; Text = "等人时，查英雄、看技能、琢磨出装。赛后记录，也清晰留存。" },
  @{ File = "08-finale.wav"; Text = "熟悉的朋友，也可以是好对手。今晚，峡谷见。王者演武堂，和朋友，好好打一场。" }
)

$synthesizer = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $synthesizer.SelectVoice($VoiceName)
  $synthesizer.Rate = $Rate
  $synthesizer.Volume = 100

  foreach ($segment in $segments) {
    $target = Join-Path $outputDirectory $segment.File
    $synthesizer.SetOutputToWaveFile($target)
    $synthesizer.Speak($segment.Text)
    $synthesizer.SetOutputToNull()
    Write-Output "$($segment.File)`t$($segment.Text)"
  }
} finally {
  $synthesizer.Dispose()
}
