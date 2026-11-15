# The non-build paths

`SKILL.md` section 0 sends an issue here when its state label is not `ready-for-agent`. Follow the section for its state.

These paths work from the main checkout and need no worktree. They read code, edit the issue and post comments, and change no files in the repository. The one exception is an ADR or another file the outcome has to put in the repository: write it in the issue's worktree and ship it through `SKILL.md` sections 1, 3 and 4. Put `Closes #<n>` in that PR only when the PR finishes the issue; otherwise use `Refs #<n>`. Sections 1 and 3 assign the issue, which `/subagent-kit:next` then shows as in flight until the PR merges.

## Rules for every path

- **The state labels.** Each open issue that is not an epic has exactly one:

  | Label | Means | Body line |
  | --- | --- | --- |
  | `needs-triage` | Not evaluated yet | none |
  | `needs-research` | A question an agent can answer by investigating: a spike, probe or data check | `Question:` |
  | `needs-decision` | We have to choose before it can be built | `Decision:` |
  | `needs-info` | Waiting on a named outside person | `Waiting on:` |
  | `ready-for-agent` | Fully specified; no human needed | none |
  | `ready-for-human` | Needs a person's hands: access, credentials, a UI, production | `Waiting on:` |

  `waiting` goes beside a state label when the issue waits on a date or an outside event, with a `Not before: YYYY-MM-DD` or `Waiting on:` line. Don't add `blocked` or `wontfix`: a blocker is a native "blocked by" link (`bash <this skill's base directory>/../grill/scripts/link.sh blocked-by <issue> <blocker>`), and an issue that won't be done is closed with `gh issue close <n> --reason "not planned"` and a comment saying why.
- **Next-step lines.** Each sits alone on a line at the left margin of the body, because `/subagent-kit:next` reads it there and shows it. Keep it to one line naming who or what, such as `Decision: whether to sync deletes, or only creates and updates`.
- **Editing the body.** Fetch it with `gh issue view <n> --json body -q .body`, write the new body to a file in your scratchpad and run `gh issue edit <n> --body-file <file>`. Keep the reporter's text. Add or replace sections below it, such as `## Acceptance criteria`, and add a `Files:` line naming the directories or modules it touches when you know them. Never put file paths or code elsewhere in the body.
- **Moving it on.** Change labels in one call, such as `gh issue edit <n> --remove-label needs-triage --add-label ready-for-agent`, and remove the old next-step line once it no longer applies. Every path ends by saying the issue's new state and the command to run next, if any, such as `/subagent-kit:issue <n>`.
- **Comments.** Post them with `gh issue comment <n> --body-file <file>`. Never put secrets, tokens or customer data in an issue.
- **Decisions are mine.** Lay out options and recommend, but never record a choice I haven't made.

## needs-triage

Also the path for an issue with no state label or with more than one.

1. Read the issue and its comments against the code. Use `scoper` as DELEGATION.md says when the area is unfamiliar. Check the open queue with `bash <this skill's base directory>/../next/scripts/next.sh` for duplicates and for issues that block this one or that it blocks.
2. If it duplicates an open issue, comment with a link and close it with `--reason "not planned"`. If it is already done, comment with the evidence and close it as completed.
3. Write the acceptance criteria into the body: concrete, checkable, each with the check that proves it.
4. If it won't fit one agent session, including its own verification, split it. Draft the slices by `/subagent-kit:grill` phase 3's rules (read that section of `<this skill's base directory>/../grill/SKILL.md`), show me the breakdown and publish only once I approve, as that file's phase 4 says. Make each one a sub-issue with `link.sh sub <n> <child>`. This issue becomes their epic: remove its state label.
5. Choose the state label from the table, add its next-step line and native blocker links, and move the issue on.
6. List the questions you could not answer from the issue or the code. Each one is either the issue's `Question:` or `Decision:` line, or something to ask me now.

## needs-research

1. The question is the `Question:` line, or the body if there is none.
2. Investigate: read the code, run probes and data checks, write a spike. Spike code is throwaway: keep it in your scratchpad, never in the repository. Network and data checks stay with you; `scoper` can't run them. Stop once the question is answered or you know it can't be answered without a person, and don't drift into building the fix.
3. Post the findings as a comment headed `## Findings`: the answer first, then the evidence (commands and their output, links to code at a commit), what it means for the issue, and anything left unknown.
4. Move it on, saying which in the comment:
   - The answer settles what to build: rewrite the body as a build spec with acceptance criteria, remove the `Question:` line, and relabel it `ready-for-agent`.
   - It shows a choice to make: add a `Decision:` line and relabel it `needs-decision`.
   - It needs an outside person: add a `Waiting on:` line and relabel it `needs-info`.
   - The question was all there was: close it as completed, or with `--reason "not planned"` if the answer is that nothing should be done.
5. Open a PR only if the outcome needs an ADR: the answer settles a hard-to-reverse design choice, and the repository keeps ADRs (look for an `adr` folder under `docs/`, or ADRs mentioned in `CLAUDE.md`).

## needs-decision

1. The decision is the `Decision:` line. Read the body, the comments, the code it touches, and the glossary and ADRs in the area.
2. Lay out the options: what each means for the code and for later work, what it costs, what it rules out, and your recommendation with the reason.
3. Grill me on it. Read section 2 of `<this skill's base directory>/../grill/SKILL.md` and use its rounds and question format, scoped to this decision and the choices that hang off it. Wait for my answers. If I don't settle it, post the options and your recommendation as a comment headed `## Options`, leave the label and stop.
4. Record what I decided:
   - Post a comment headed `## Decision`: the choice, why, and the options rejected.
   - Rewrite the body to build the chosen option, with acceptance criteria, and remove the `Decision:` line.
   - If the choice is hard to reverse and the repository keeps ADRs, write one and open a PR as described at the top of this file, with `Refs #<n>`.
5. Relabel it `ready-for-agent`, or run the triage steps again if the decision changed the scope enough to need a split.

## needs-info

1. Who it waits on is the `Waiting on:` line. If there is none, work it out from the body and comments, and add one.
2. Check whether the answer has arrived: comments since the question was asked, linked issues and PRs, and the place the repository's triage doc names for these questions. The triage doc is `docs/agents/triage-labels.md`, or whatever `CLAUDE.md` points to. If it could have arrived where you can't see, such as email or a call, ask me.
3. If it has arrived: fold it into the body, remove the `Waiting on:` line, post a comment saying what was folded in and where it came from, and move the issue on as triage would.
4. If not: write up the open questions where the triage doc says, such as a meeting-notes file. When that place is a file in the repository, ship the change as a small PR as described at the top of this file. When it is outside the repository, give me the text to paste. When the doc names no place, post them as a comment headed `## Open questions for <who>`, unless the latest such comment already asks the same ones. Leave the label.

## ready-for-human

First look for an earlier runbook: a comment headed `## Runbook`.

**No runbook yet:**

1. Do the parts an agent can do. Read-only checks and gathering values are yours. A change to code or config goes through `SKILL.md` sections 1 to 4 as a PR with `Refs #<n>`, since the person's part is still to come.
2. Post a comment headed `## Runbook`: what access it needs, then numbered steps, each with where to do it (URL, console path or machine), the exact command or click path, what they should see, and how to check it worked. End with what to report back. Never put secrets in it; name where to get them.
3. Make sure the body has a `Waiting on:` line naming the person and the runbook, then stop.

**A runbook exists:**

1. Check the person's work: run each step's check that an agent can run, read-only. Ask me about any you can't check.
2. If every step checks out, post a comment saying what was checked and close the issue as completed. If not, post a comment naming the steps not done or not working, and leave it open.
