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
