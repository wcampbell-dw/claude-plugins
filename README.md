# claude-plugins

A small collection of [Claude Code](https://claude.com/claude-code) plugins:

| Plugin | What it does |
| --- | --- |
| [agent-spinners](#agent-spinners) | Live list of running subagents above the prompt, with braille spinners and toasts when they finish |
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

A band above the prompt with one row per subagent: a spinner showing its state, its agent type, its task, then its latest tool call.

```
⠹ general-purpose  Fix the flaky login test         › Bash: Run the login tests
⠼ acme-to…reviewer Review the retry logic           › Read: retry.ts
⠸ Explore          Survey plugin manifests          › finished
```

- **Spinners:** running agents spin in cyan, and queued or blocked ones spin slower in yellow. An idle teammate freezes on its last frame in gray.
- **Activity:** after the `›`, each row shows the agent's latest tool call: Bash by its description, file tools by the file's name, searches by their pattern. A live row dims after 5 seconds without a status change or tool call, and brightens again on the next one.
- **Finishing:** an agent that ends freezes its spinner in gray and shows **finished** in green, or **failed** or **stopped** in red, at full brightness for 8 seconds, then drops off. The band disappears when no agents are left.
- **Toasts:** a toast tells you when an agent finishes, fails or is stopped, and stays up longer when one is waiting on you, for example at a permission prompt.
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

### subagent-kit

Four subagents that take work off the main session's model, and the rules for when the main session hands work to them. Based on Andrea Grandi's [Using Claude Code subagents to save usage](https://www.andreagrandi.it/posts/claude-code-subagents-to-save-usage/).

| Agent | Model | Job |
| --- | --- | --- |
| `subagent-kit:scoper` | Haiku | Read-only. Gathers the goal, acceptance criteria, relevant files and tests before planning |
| `subagent-kit:implementer` | Sonnet | Writes code and tests for a task already planned. Does not commit |
| `subagent-kit:reviewer` | Opus | Read-only. Independent review, only when you ask or the change is risky |
| `subagent-kit:shipper` | Haiku | Commits, pushes and opens pull requests, only the steps you asked for |

The rules (`plugins/subagent-kit/DELEGATION.md`) are added to the main session's system prompt, the way an `@` import in `~/.claude/CLAUDE.md` would add them. Subagents don't get them. The main session plans, reviews every diff the implementer returns and runs the tests, and the cheaper models do the reading, the editing and the git work.

```
/plugin install subagent-kit --marketplace wcampbell-dw/claude-plugins
```

> [!NOTE]
> If you already have agents named `scoper`, `implementer`, `reviewer` or `shipper` in `~/.claude/agents`, or delegation rules in your `CLAUDE.md`, remove them. Otherwise the main session sees both sets.

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
