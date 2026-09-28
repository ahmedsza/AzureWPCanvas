param(
    [switch]$Probe,
    [string]$Deck,
    [string]$Plan
)
$ErrorActionPreference = 'Stop'
$app = $null
$presentation = $null
$wasEmpty = $false
$stage = 'start'
try {
    $app = New-Object -ComObject PowerPoint.Application
    $wasEmpty = ($app.Presentations.Count -eq 0)
    if ($Probe) {
        [ordered]@{
            tool = 'PowerPoint COM'
            version = [string]$app.Version
            build = [string]$app.Build
            os = [Environment]::OSVersion.VersionString
            renderer = 'slide-export-png-1600x900-v1'
        } | ConvertTo-Json -Compress
    } else {
        if (-not $Deck -or -not $Plan) { throw 'Deck and Plan are required.' }
        $items = @(Get-Content -LiteralPath $Plan -Raw | ConvertFrom-Json)
        $stage = 'open'
        $presentation = $app.Presentations.Open($Deck, $true, $false, $false)
        foreach ($item in $items) {
            $slide = $null
            try {
                $stage = 'export'
                $slide = $presentation.Slides.Item([int]$item.index)
                $slide.Export([string]$item.output, 'PNG', 1600, 900)
                if (-not (Test-Path -LiteralPath $item.output)) { throw "Slide export did not create its image." }
            } finally {
                if ($slide) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($slide) }
            }
        }
        [ordered]@{ rendered = $items.Count } | ConvertTo-Json -Compress
    }
} catch {
    [Console]::Error.WriteLine("PowerPoint $stage failed (HRESULT $($_.Exception.HResult)). Install desktop Microsoft PowerPoint on Windows and close any blocking Office dialogs. Plain generation does not require PowerPoint.")
    exit 1
} finally {
    if ($presentation) {
        $presentation.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
    }
    if ($app) {
        if ($wasEmpty) { $app.Quit() }
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($app)
    }
}
