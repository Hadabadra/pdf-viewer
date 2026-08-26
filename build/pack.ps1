<#
  סקריפט אריזה לצופה PDF+OCR.
  בכל הרצה: בדיקת שפיות (אם קיימת) → העלאת מספר הגרסה במניפסט → ערך חדש ב-CHANGELOG →
  אריזת .otzplugin (zip רגיל בשם החבילה, להתקנה בתוך אוצריא).

  שימוש נפוץ:
    .\build\pack.ps1                                   # patch: 2.5.2 -> 2.5.3
    .\build\pack.ps1 -Minor                            # 2.5.2 -> 2.6.0
    .\build\pack.ps1 -Title "כותרת" -Notes "…","…"      # טקסט ה-CHANGELOG
    .\build\pack.ps1 -Release                          # + commit, tag, push ו-GitHub Release

  ⚠️ כל אריזה מקבלת מספר גרסה טרי. אוצריא אינה מחליפה קבצים בהתקנה־מחדש של
  אותו מספר, ותיקון שנארז מחדש תחת אותו מספר פשוט לא יגיע למי שכבר התקין.
#>

param(
  [switch]$Major,        # 2.5.2 -> 3.0.0
  [switch]$Minor,        # 2.5.2 -> 2.6.0
  [switch]$Patch,        # 2.5.2 -> 2.5.3 (ברירת מחדל)
  [switch]$NoBump,       # אורז בדיוק את הגרסה שכתובה כרגע במניפסט, בלי להעלות

  [string]$Title,
  [string[]]$Notes,
  [switch]$NoChangelog,

  [switch]$Release,
  [switch]$AllowValidationErrors
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$root = Split-Path -Parent $PSScriptRoot
$manifestPath  = Join-Path $root "manifest.json"
$changelogPath = Join-Path $root "CHANGELOG.md"
$distDir = Join-Path $root "dist"

if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }

# ---- 0. בדיקת שפיות (אם קיים tools\validate.js) ----
$validateJs = Join-Path $root "tools\validate.js"
if (Test-Path $validateJs) {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node אינו מותקן/בנתיב, ולכן אי אפשר להריץ את בדיקת השפיות. התקן Node, או הרץ עם -AllowValidationErrors."
  }
  Write-Host "בדיקת שפיות: node tools/validate.js --strict" -ForegroundColor Cyan
  Push-Location $root
  try { & node "tools/validate.js" "--strict"; $validateExit = $LASTEXITCODE }
  finally { Pop-Location }
  if ($validateExit -ne 0) {
    if ($AllowValidationErrors) {
      Write-Warning "הוולידציה יצאה בקוד $validateExit — ממשיכים בגלל -AllowValidationErrors."
    } else {
      throw "בדיקת השפיות נכשלה (קוד יציאה $validateExit). האריזה נעצרה."
    }
  } else {
    Write-Host "הוולידציה עברה נקי." -ForegroundColor Green
  }
}

# ---- 1. העלאת מספר הגרסה ----
$bumpFlags = @($Major, $Minor, $Patch, $NoBump) | Where-Object { $_ }
if ($bumpFlags.Count -gt 1) { throw "אפשר לבחור רק אחד מ: -Major / -Minor / -Patch / -NoBump." }

$manifestRaw = Get-Content $manifestPath -Raw -Encoding UTF8
$manifest = $manifestRaw | ConvertFrom-Json
if ($manifest.description.Length -gt 150) {
  throw "תיאור המניפסט ($($manifest.description.Length) תווים) חורג מ-150 - אוצריא דוחה התקנה. קצרו לפני האריזה."
}
$parts = $manifest.version -split '\.'
if ($parts.Count -ne 3) { throw "פורמט גרסה לא תקין במניפסט: $($manifest.version)" }
$oldVersion = $manifest.version
$maj = [int]$parts[0]; $min = [int]$parts[1]; $pat = [int]$parts[2]

if     ($NoBump) { $newVersion = $oldVersion }
elseif ($Major)  { $newVersion = "$($maj + 1).0.0" }
elseif ($Minor)  { $newVersion = "$maj.$($min + 1).0" }
else             { $newVersion = "$maj.$min.$($pat + 1)" }
$manifest.version = $newVersion

$json = $manifest | ConvertTo-Json -Depth 10
$json = [System.Text.RegularExpressions.Regex]::Unescape($json)
[System.IO.File]::WriteAllText($manifestPath, $json, [System.Text.UTF8Encoding]::new($false))

if ($NoBump) { Write-Host "אורז את הגרסה שבמניפסט ללא העלאה: $newVersion" }
else { Write-Host "גרסה עודכנה: $oldVersion -> $newVersion" }

# ---- 1ב. ערך חדש ב-CHANGELOG.md ----
function Get-HebrewDateString([datetime]$date) {
  $ci = [System.Globalization.CultureInfo]::GetCultureInfo('he-IL').Clone()
  $ci.DateTimeFormat.Calendar = New-Object System.Globalization.HebrewCalendar
  $s = $date.ToString('d בMMMM yyyy', $ci)
  return $s.Replace('"', [char]0x05F4).Replace("'", [char]0x05F3)
}

function Get-DefaultNotes {
  $lastTag = (& git -C $root tag --list "v*" --sort=-v:refname | Select-Object -First 1)
  $range = if ($lastTag) { "$lastTag..HEAD" } else { "-n15" }
  $subjects = & git -C $root log --format=%s $range 2>$null
  return @($subjects | Where-Object { $_ -and $_ -notmatch '^(תוכניות|docs?):' })
}

if (-not $NoChangelog) {
  $heDate  = Get-HebrewDateString (Get-Date)
  $enDate  = (Get-Date).ToString('dd/MM/yyyy')
  $body    = if ($Notes -and $Notes.Count) { $Notes } else { Get-DefaultNotes }
  $headline = if ($Title) { $Title } elseif ($body.Count) { "$($body.Count) שינויים בגרסה זו." } else { "אריזה מחדש." }

  $entry = New-Object System.Text.StringBuilder
  [void]$entry.AppendLine("## $newVersion — $heDate ($enDate)")
  [void]$entry.AppendLine("")
  [void]$entry.AppendLine("**$headline**")
  if ($body.Count) {
    [void]$entry.AppendLine("")
    foreach ($n in $body) { [void]$entry.AppendLine("* $n") }
  }
  [void]$entry.AppendLine("")

  $clRaw = if (Test-Path $changelogPath) { Get-Content $changelogPath -Raw -Encoding UTF8 } else { "# CHANGELOG — צופה PDF+OCR`r`n`r`n" }
  if ($clRaw -match ("(?m)^##\s+" + [regex]::Escape($newVersion) + "\s")) {
    Write-Warning "כבר קיים ערך ל-$newVersion ב-CHANGELOG.md — לא נכתב ערך נוסף."
  } else {
    $idx = $clRaw.IndexOf("`n## ")
    if ($idx -lt 0) { $clNew = $clRaw.TrimEnd() + "`r`n`r`n" + $entry.ToString() }
    else { $clNew = $clRaw.Substring(0, $idx + 1) + $entry.ToString() + $clRaw.Substring($idx + 1) }
    [System.IO.File]::WriteAllText($changelogPath, $clNew, [System.Text.UTF8Encoding]::new($false))
    Write-Host "נכתב ערך CHANGELOG: $newVersion — $heDate ($enDate), $($body.Count) תבליטים"
  }
}

# ---- 2. הכנת תיקיית staging נקייה ----
$stageDir = Join-Path $env:TEMP "pdf-viewer-stage"
if (Test-Path $stageDir) { Remove-Item $stageDir -Recurse -Force }
New-Item -ItemType Directory -Path $stageDir | Out-Null

$excludeDirs = @('build', 'dist', '.git', '.github', '.claude')
$excludeFiles = @('README.md', '.gitignore', '.gitattributes')

Get-ChildItem -Path $root -Force | Where-Object {
  $_.Name -notin $excludeDirs -and $_.Name -notin $excludeFiles -and $_.Name -ne (Split-Path $stageDir -Leaf)
} | ForEach-Object {
  Copy-Item $_.FullName -Destination (Join-Path $stageDir $_.Name) -Recurse -Force
}

# ---- 3. אריזת .otzplugin (zip רגיל בשינוי סיומת) ----
$pluginId = $manifest.id
$otzpluginName = "$pluginId-$newVersion.otzplugin"
$otzpluginPath = Join-Path $distDir $otzpluginName
if (Test-Path $otzpluginPath) { Remove-Item $otzpluginPath -Force }

$tmpZip = Join-Path $env:TEMP "pdf-viewer-$newVersion.zip"
if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force }
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $tmpZip -CompressionLevel Optimal
Move-Item $tmpZip $otzpluginPath

Remove-Item $stageDir -Recurse -Force

Write-Host "נוצר קובץ תוסף: $otzpluginPath"

# ---- 4. שומר גודל ----
$sizeMB = [math]::Round((Get-Item $otzpluginPath).Length / 1MB, 1)
Write-Host ""
Write-Host "גודל החבילה: $sizeMB MB"
if ($sizeMB -gt 16) {
  Write-Warning "החבילה גדולה מהצפוי ($sizeMB MB, הרף 16MB). בדוק אם נוספה תיקייה שצריכה להיכנס ל-`$excludeDirs ב-build\pack.ps1."
}

Write-Host ""
Write-Host "סיום. גרסה חדשה: $newVersion"
Write-Host "  - להתקנה באוצריא: $otzpluginPath"

# ---- 5. שחרור: commit + tag + push + GitHub Release ----
if (-not $Release) {
  Write-Host ""
  Write-Host "(לא שוחרר. להוספת commit, תג v$newVersion, push ו-GitHub Release — הרץ שוב עם -Release.)" -ForegroundColor DarkGray
  return
}

Write-Host ""
Write-Host "=== שחרור $newVersion ===" -ForegroundColor Cyan

$dirty = @(& git -C $root status --porcelain | Where-Object { $_ -notmatch '(manifest\.json|CHANGELOG\.md)$' })
if ($dirty.Count) {
  Write-Warning "יש שינויים לא-מחויבים מעבר ל-manifest/CHANGELOG:"
  $dirty | ForEach-Object { Write-Warning "  $_" }
  throw "השחרור נעצר. החבילה נוצרה בהצלחה, אבל תוכן שאין לו commit לא יתועד בתג."
}

$tag = "v$newVersion"
if (& git -C $root tag --list $tag) { throw "התג $tag כבר קיים. כל אריזה מקבלת מספר גרסה טרי." }

& git -C $root add -- manifest.json CHANGELOG.md
& git -C $root commit -m "$newVersion — אריזה" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "git commit נכשל." }
& git -C $root tag -a $tag -m "$newVersion"
if ($LASTEXITCODE -ne 0) { throw "git tag נכשל." }
& git -C $root push
if ($LASTEXITCODE -ne 0) { throw "git push נכשל." }
& git -C $root push origin $tag
if ($LASTEXITCODE -ne 0) { throw "דחיפת התג נכשלה." }
Write-Host "נדחפו commit ותג $tag." -ForegroundColor Green

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Warning "gh CLI אינו מותקן — ה-Release לא נוצר. הקובץ לצירוף ידני: $otzpluginPath"
  return
}
$clText = Get-Content $changelogPath -Raw -Encoding UTF8
$m = [regex]::Match($clText, "(?ms)^##\s+" + [regex]::Escape($newVersion) + "\s.*?(?=^##\s|\z)")
$relNotes = if ($m.Success) { $m.Value.Trim() } else { "צופה PDF+OCR $newVersion" }
$notesFile = Join-Path $env:TEMP "pdf-viewer-release-$newVersion.md"
[System.IO.File]::WriteAllText($notesFile, $relNotes, [System.Text.UTF8Encoding]::new($false))

& gh release create $tag $otzpluginPath --title "צופה PDF+OCR $newVersion" --notes-file $notesFile
if ($LASTEXITCODE -ne 0) { Write-Warning "gh release create נכשל. התג כבר נדחף — אפשר ליצור את ה-Release ידנית ולצרף: $otzpluginPath" }
else { Write-Host "נוצר GitHub Release $tag עם החבילה מצורפת." -ForegroundColor Green }
Remove-Item $notesFile -Force -ErrorAction SilentlyContinue
