# Starts Claude Code with this checkout's copy of every wcampbell plugin you
# have enabled in your user settings, loaded with --plugin-dir so edits reload
# without a reinstall. Arguments pass through to claude: ./dev.ps1 --resume
$settingsPath = Join-Path $HOME '.claude/settings.json'
$enabled = (Get-Content $settingsPath -Raw | ConvertFrom-Json).enabledPlugins

$pluginArgs = foreach ($id in $enabled.PSObject.Properties) {
    if ($id.Value -and $id.Name -like '*@wcampbell') {
        $dir = Join-Path $PSScriptRoot "plugins/$($id.Name -replace '@wcampbell$')"
        if (Test-Path $dir) { '--plugin-dir'; $dir }
        else { Write-Warning "$($id.Name) is enabled but $dir does not exist" }
    }
}

& claude @pluginArgs @args
