# claude-plugins

wcampbell's personal Claude Code plugin marketplace.

## Setup

Add the marketplace once per machine, at a Claude Code prompt:

```
/plugin marketplace add wcampbell-dw/claude-plugins
```

Then install the plugins you want, by name or by browsing `/plugin`.

## Plugins

### wc-statusline

A three-line status line drawn with Nerd Font icons and your terminal's own colors.

```
  ~/projects/manitou                                          main 
󰚩 Opus 5.5  󰓅 medium │ 󰍛 ━━──────── 18% 182k/1M
 wcampbell │  5h ━━━━────── 35% 󰑓 3:10pm 3h07m │  7d 2% 󰑓 Sun 6pm 6d5h
```

```
/plugin install wc-statusline --marketplace wcampbell-dw/claude-plugins
```

Then run `/statusline-install` once per machine. It points the `statusLine` setting in `~/.claude/settings.json` at `~/.claude/wc-statusline.sh` and keeps your other settings. Each session start copies the plugin's current script to that path, so plugin updates reach the status line without running the command again.

Needs a [Nerd Font](https://www.nerdfonts.com/) in your terminal, and `bash`, `jq` and `git` on PATH (Git Bash on Windows).

### swap

`/swap [num|email|alias]` runs `cswap switch` to change Claude accounts. With no argument it rotates to the next account. Needs `cswap` on PATH.

```
/plugin install swap --marketplace wcampbell-dw/claude-plugins
```

### agent-spinners

A band above the prompt with one row per subagent: a braille spinner while it runs, its type, then its description.

```
⠹ general-purpose  Fix the flaky login test
⠼ mattpoc…research Look up the retry API
✓ Explore          Survey plugin manifests
```

- Running agents spin in cyan; queued or blocked ones spin slower in yellow. An idle teammate holds its last frame in gray.
- The description dims after 5 seconds without a status change or tool call, and brightens on the next one.
- Finished agents show ✓ (or ✗ when they failed or were stopped) for 8 seconds, then drop off. The band disappears when no agents are left.
- Types are fixed at 16 columns. A long `plugin:agent` name gives up its plugin name first (`mattpoc…research`, then `research`), and only then is the agent name cut.

```
/plugin install agent-spinners --marketplace wcampbell-dw/claude-plugins
```

The spinners animate in the terminal and the desktop app; other surfaces show a static `●`. Claude Code's own subagent list still shows below it.
