# Windows shells

- Write file contents and `gh` bodies with the Write tool, then run a short command that reads the file (`--body-file <file>`, `python -I <script>`). Bash commands past about 7 KB arrive cut short.
- Change existing files with the Edit tool. A `sed` or Python rewrite run through a shell passes the text through two layers of quoting, and backslashes and nested quotes in it come out changed.
- The PowerShell tool reports exit 1 whenever the last statement fails, `-ErrorAction SilentlyContinue` or `Ignore` included. End a probe with a plain output line (`; "done"`), and read "Exit code 1" beside the expected output as success.
- Name PowerShell functions Verb-Noun (`Invoke-Helper`). A one- or two-letter name loses to a built-in alias: `h` is `Get-History`.
- Give `Remove-Item` its own call. The deletion check reads every quoted path in the command, so a `'/'` or `"C:\Program Files"` elsewhere gets the whole command refused.
- Each shell takes its own syntax: in PowerShell, nest quotes by doubling them or with single quotes (`\"` is Bash); in Bash, use `$(...)` (`` `$ `` and `(Get-Date)` are PowerShell). Logic longer than a line goes in a scratchpad `.ps1` or `.py` file, run by path.
- Wait with `run_in_background` or Monitor. A command that leads with `sleep` or `Start-Sleep` is refused.
- In a worktree-isolated session, run each command plainly from the worktree root. A `cd ... &&` chain is refused as too complex to verify.
