# Testing plugin changes live

This checkout is the source of the plugins the `wcampbell` marketplace ships. `.claude/settings.json` turns the installed `@wcampbell` copies off in this project; `./dev.ps1` starts Claude Code with this checkout's copy of each one the user has enabled, through `--plugin-dir`. Those plugins show as `<name>@inline`.

A session started with plain `claude` has none of these plugins. When `claude plugin list` shows no `@inline` entries for them, tell the user to restart with `./dev.ps1` (arguments pass through, as in `./dev.ps1 --resume`).

After changing a plugin under `plugins/<name>/`, check the change in this session. Hooks modules reload on save, by the end of the turn; a tool the plugin registers can answer once more from the old code right after an edit, so call it again before judging the change missing. For a skill, agent or command change that doesn't show up, ask the user to run `/reload-plugins`. The step is done when the changed behaviour has been seen working here, not only in `claude plugin test`.

To try a plugin that isn't enabled in the user's settings, such as `shell-guard`, restart with `./dev.ps1 --plugin-dir ./plugins/<name>`.
