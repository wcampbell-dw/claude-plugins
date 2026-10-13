# claude-plugins

A small collection of [Claude Code](https://claude.com/claude-code) plugins:

| Plugin | What it does |
| --- | --- |
| [agent-spinners](#agent-spinners) | Live list of running subagents above the prompt, with braille spinners and toasts when they finish |
| [statusline](#statusline) | Three-line status line: directory and git, model and context, account and usage limits |
| [swap](#swap) | `/swap` slash command to switch Claude accounts with `cswap` |

## Getting started

Add this marketplace once, at a Claude Code prompt:

```
/plugin marketplace add wcampbell-dw/claude-plugins
```

Then install the plugins you want with the commands below, or browse them with `/plugin`. To pick up new versions later, run `/plugin update <name>`.

## Plugins

### agent-spinners

A band above the prompt with one row per subagent: a spinner showing its state, its agent type, then what it's working on.

```
⠹ general-purpose  Fix the flaky login test
⠼ acme-to…reviewer Review the retry logic
✓ Explore          Survey plugin manifests
```

- **Spinners:** running agents spin in cyan, and queued or blocked ones spin slower in yellow. An idle teammate freezes on its last frame in gray.
- **Activity:** an agent's description dims after 5 seconds without a status change or tool call, and brightens again on the next one.
- **Finishing:** finished agents show ✓ (or ✗ when they failed or were stopped) for 8 seconds, then drop off. The band disappears when no agents are left.
- **Toasts:** a toast tells you when an agent finishes, fails or is stopped, and stays up longer when one is waiting on you, for example at a permission prompt.
- **Long names:** agent types get a fixed 16 columns so rows line up. A long `plugin:agent` name gives up its plugin name first (`acme-to…reviewer`, then `reviewer`), and only then is the agent name cut.

```
/plugin install agent-spinners --marketplace wcampbell-dw/claude-plugins
```

The spinners animate in the terminal and the desktop app; other surfaces show a static `●`. Claude Code's own subagent list still shows below the band.

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

### swap

`/swap [num|email|alias]` runs `cswap switch` to change which Claude account you're signed in with. With no argument, it rotates to the next account.

```
/plugin install swap --marketplace wcampbell-dw/claude-plugins
```

**Needs:** [claude-swap](https://github.com/realiti4/claude-swap) (`uv tool install claude-swap` or `pipx install claude-swap`), with your accounts added via `cswap add`.

## Requirements

agent-spinners and statusline are built on Claude Code's plugin hooks API, which is in early access, so they need a recent Claude Code. They were developed against version 2.1.296. swap is a plain slash command and works on any version with plugin support.

## Issues

Found a bug or have an idea? [Open an issue](https://github.com/wcampbell-dw/claude-plugins/issues).

## License

[MIT No Attribution](LICENSE) (MIT-0): use, copy, modify and share the code however you like, with no need to credit anyone.
