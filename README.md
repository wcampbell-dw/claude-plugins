# claude-plugins

A small collection of [Claude Code](https://claude.com/claude-code) plugins:

| Plugin | What it does |
| --- | --- |
| [agent-spinners](#agent-spinners) | Live list of running subagents and background tasks above the prompt, with braille spinners and toasts when agents finish |
| [shell-guard](#shell-guard) | On Windows, refuses Bash commands too long to arrive whole and `az` calls that cmd.exe would re-parse, installs `az` shims, and adds shell rules to the prompt |
| [statusline](#statusline) | Three-line status line: directory and git, model and context, account and usage limits |
| [subagent-kit](#subagent-kit) | Subagents on cheaper models for scoping, implementing, reviewing and shipping, with rules for when to use them |
| [swap](#swap) | `/swap` slash command to switch Claude accounts with `cswap` |

## Getting started

Add this marketplace once, at a Claude Code prompt:

```
/plugin marketplace add wcampbell-dw/claude-plugins
```

Then install the plugins you want with the commands below, or browse them with `/plugin`. To pick up new versions later, run `/plugin update <name>`.

## Plugins

### agent-spinners

A band above the prompt with one row per subagent and per background task: a spinner showing its state, its agent type (or `shell` or `monitor`), its task, then its latest tool call or event.

```
⠹ general-purpose  Fix the flaky login test         › Bash: Run the login tests
⠼ acme-to…reviewer Review the retry logic           › Read: retry.ts
  └ ⠴ shell        Run the login tests in a loop
⠸ Explore          Survey plugin manifests          › finished
⠸ monitor          errors in deploy.log             › ERROR: timeout after 30s
```

- **Spinners:** running agents spin in magenta and running tasks in cyan, and queued or blocked ones spin slower in yellow. An idle teammate freezes on its last frame in gray. The colors come from your Claude Code theme; pick an "ANSI colors only" theme in `/theme` to have them follow your terminal's palette, as the statusline does.
- **Activity:** after the `›`, each row shows the agent's latest tool call: Bash by its description, file tools by the file's name, searches by their pattern. A live row dims after 5 seconds without a status change or tool call, and brightens again on the next one.
- **Finishing:** an agent that ends freezes its spinner in gray and shows **finished** in green, or **failed** or **stopped** in red, at full brightness for 8 seconds, then drops off. The band disappears when no agents or tasks are left.
- **Background tasks:** Bash and PowerShell commands running in the background and Monitor watches get a row of their own, with `shell` or `monitor` in place of an agent type. One started by a subagent sits directly under that agent's row, marked with `└`; the rest come after the agents. A task row spins and dims like an agent's, and shows **finished**, **failed** or **stopped** when it ends, then drops off after 8 seconds, including one a subagent started while that subagent keeps working. A monitor row shows its latest event in place of a tool call. Tasks raise no toasts.
- **Toasts:** a toast tells you when an agent finishes, fails or is stopped, and stays up longer when one is waiting on you, for example at a permission prompt.
- **Notify when idle** (off by default): sends a notification each time Claude stops with no background tasks left running, so you can tell "waiting on you" from "waiting on a shell or monitor". A stop that leaves tasks running sends nothing; the notification comes when the last one has finished and Claude stops again. Turn it on with the agent-spinners **Notify when idle** row in `/config`.
  - **Setup:** the notification goes through Claude Code's own notification channel. On Windows Terminal, `auto` finds no channel and nothing appears, so open `/config` and set **Notifications** to `terminal_bell`: the tab then shows a bell icon when Claude is idle. Claude Code's own notifications, such as permission prompts, ring the same bell. Terminals with native notifications (iTerm2, Kitty, Ghostty) show the text instead.
- **Long names:** agent types get a fixed 16 columns and tasks 32, cut with `…`, so rows line up. A long `plugin:agent` name gives up its plugin name first (`acme-to…reviewer`, then `reviewer`), and only then is the agent name cut.

```
/plugin install agent-spinners --marketplace wcampbell-dw/claude-plugins
```

The spinners animate in the terminal and the desktop app; other surfaces show a static `●` (`○` once an agent has ended). Claude Code's own subagent list still shows below the band.

### statusline

A three-line status line drawn with Nerd Font icons in your terminal's own colors.

```
  ~/projects/my-app                                           main 
󰚩 Opus 5.5  󰓅 medium │ 󰍛 ━━──────── 18% 182k/1M
 you │  5h ━━━━────── 35% 󰑓 3:10pm 3h07m │  7d 2% 󰑓 Sun 6pm 6d5h
```

1. Directory and git branch with its status. Both are links: Ctrl+click opens the folder or the repository on GitHub.
2. Model, effort level, and how full the context window is.
3. Signed-in account, then your 5-hour and 7-day usage limits with when each resets.

```
/plugin install statusline --marketplace wcampbell-dw/claude-plugins
```

Then run `/statusline-install` once on each machine. It sets the `statusLine` setting in `~/.claude/settings.json` to run `~/.claude/statusline.sh`, keeping your other settings. The plugin copies its current script to that path at every session start, so updates reach your status line without running the command again.

To undo it, run `/statusline-uninstall`. It puts back the `statusLine` setting and the `~/.claude/statusline.sh` you had before the plugin replaced them, and stops copying the script until you run `/statusline-install` again. If you had no script at that path, the copy stays there for you to delete.

> [!NOTE]
> The plugin overwrites `~/.claude/statusline.sh` at every session start. It keeps the first file it replaces, which `/statusline-uninstall` restores. A file replaced before this version of the plugin is not kept.

**Needs:** a [Nerd Font](https://www.nerdfonts.com/) in your terminal, and `bash`, `jq` and `git` on your PATH (on Windows, Git Bash provides `bash`). It's built and tested on Windows under Git Bash. It sticks to plain bash, `jq` and `git`, so macOS and Linux should work, but they haven't been tested.

### shell-guard

On Windows, refuses Bash and PowerShell commands that would fail in ways the error doesn't explain, and tells Claude what to do instead:

- **Long Bash commands.** Bash commands over about 7 KB arrive cut short and fail with `unexpected EOF while looking for matching`. Usually it's a big heredoc. shell-guard refuses Bash commands over 6,000 characters and points Claude to the Write tool.
- **`az` and cmd.exe.** `az` is `az.cmd`, so cmd.exe re-parses its arguments and splits them at `&` and `|`. A URL loses its later parameters and a JMESPath or KQL query is cut, often with no error. Without the shims below, shell-guard refuses `az` calls that have `&` or `|` inside a quoted argument. With them, it only refuses an explicit `az.cmd`.

```
/plugin install shell-guard --marketplace wcampbell-dw/claude-plugins
```

Then run `/shell-guard-install` once on each machine. It copies two `az` shims, `az` for Git Bash and `az.ps1` for PowerShell, to `%USERPROFILE%\.local\bin`. The shims run the Azure CLI's own Python directly, so nothing goes through cmd.exe, and they make `az` work in Git Bash, where only `az.cmd` is found otherwise. The command also checks that `.local\bin` comes before the Azure CLI's `bin` folder on PATH, and says what to change if it doesn't. After an install, each session start copies the shims again whenever the plugin's versions differ, so updates reach them. `/shell-guard-uninstall` deletes the shims and stops the copying.

shell-guard also adds a short set of Windows shell rules to the system prompt of any session or subagent that has Bash or PowerShell: write files with the Write tool and change them with Edit, how the PowerShell tool reports exit codes, function names that don't collide with built-in aliases, keeping `Remove-Item` in its own call, each shell's own quoting, waiting with Monitor, and plain commands in worktree sessions. The rules are in `plugins/shell-guard/RULES.md`.

The plugin does nothing outside Windows.

### subagent-kit

Four subagents that take work off the main session's model, and the rules for when the main session hands work to them. Based on Andrea Grandi's [Using Claude Code subagents to save usage](https://www.andreagrandi.it/posts/claude-code-subagents-to-save-usage/).

| Agent | Model | Job |
| --- | --- | --- |
| `subagent-kit:scoper` | Haiku | Read-only. Gathers the goal, acceptance criteria, relevant files and tests before planning |
| `subagent-kit:implementer` | Sonnet | Writes code and tests for a task already planned. Does not commit |
| `subagent-kit:reviewer` | Opus | Read-only. Independent review, only when you ask or the change is risky |
| `subagent-kit:shipper` | Haiku | Commits, pushes and opens pull requests, only the steps you asked for |

The rules (`plugins/subagent-kit/DELEGATION.md`) are added to the main session's system prompt, the way an `@` import in `~/.claude/CLAUDE.md` would add them. Subagents don't get them. The main session plans, reviews every diff the implementer returns and runs the tests, and the cheaper models do the reading, the editing and the git work.

`/subagent-kit:issue <number>` works a GitHub issue end to end with these agents. It assigns the issue to you, builds the change in its own worktree under `.claude/worktrees/`, opens a ready-for-review PR that closes the issue, then removes the worktree. Typing the command counts as permission to commit, push and open the PR. Running it again for the same issue picks up the existing branch, for example to address review comments. It needs the `gh` CLI, signed in.

The session moves into the worktree with Claude Code's `EnterWorktree` tool, so its shells and subagents run there too. To have gitignored files such as `.env` copied into each new worktree, list them in a [`.worktreeinclude`](https://code.claude.com/docs/en/worktrees#copy-gitignored-files-into-worktrees) file at the repository root. `/subagent-kit:worktree-include` writes or updates one for you: it sorts the repository's gitignored files into local config and secrets to copy and regenerable output to leave out, checks what the project's setup actually reads, and dry-runs the result. Cleanup goes through `skills/issue/scripts/worktree.sh remove`, which removes the worktree and local branch only when nothing would be lost, and retries through Windows file locks.

```
/plugin install subagent-kit --marketplace wcampbell-dw/claude-plugins
```

> [!NOTE]
> If you already have agents named `scoper`, `implementer`, `reviewer` or `shipper` in `~/.claude/agents`, or delegation rules in your `CLAUDE.md`, remove them. Otherwise the main session sees both sets. The same goes for an `issue` skill in `~/.claude/skills`.

### swap

`/swap [num|email|alias]` runs `cswap switch` to change which Claude account you're signed in with. With no argument, it rotates to the next account.

```
/plugin install swap --marketplace wcampbell-dw/claude-plugins
```

**Needs:** [claude-swap](https://github.com/realiti4/claude-swap) (`uv tool install claude-swap` or `pipx install claude-swap`), with your accounts added via `cswap add`.

## Requirements

agent-spinners, shell-guard, statusline and subagent-kit are built on Claude Code's plugin hooks API, which is in early access, so they need a recent Claude Code. They were developed against version 2.1.296. swap is a plain slash command and works on any version with plugin support.

## Issues

Found a bug or have an idea? [Open an issue](https://github.com/wcampbell-dw/claude-plugins/issues).

## License

[MIT No Attribution](LICENSE) (MIT-0): use, copy, modify and share the code however you like, with no need to credit anyone.
