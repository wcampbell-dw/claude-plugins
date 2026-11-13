---
name: grill
description: Grill me about a plan until we share an understanding, then publish it as GitHub issues that /next and /issue can run: session-sized, with blockers, parent, files, verification and who works each.
disable-model-invocation: true
argument-hint: "[topic, or an issue number to break down]"
---

Arguments: `$ARGUMENTS`

Interview me relentlessly until we share an understanding, then publish the result as GitHub issues. Based on Matt Pocock's `grilling` and `to-tickets` skills, with the extra steps my workflow needs. Nothing is created until I approve the breakdown in phase 3. Typing `/grill` is not that approval.

## 1. Orient

- Run `bash <this skill's base directory>/../next/scripts/next.sh` to see what is already open. New issues must fit around it: link to existing issues that block or overlap the new work, never duplicate them. If it fails because there is no GitHub remote, carry on and say the publish phase needs `/subagent-kit:repo-init` first.
- If `$ARGUMENTS` is an issue number, read it with `gh issue view <n> --json number,title,state,body,comments,labels` and its sub-issues with `gh api repos/{owner}/{repo}/issues/<n>/sub_issues`. A parent's body is often only a summary.
- Read the project's glossary (`CONTEXT.md` or `GLOSSARY.md`) and the ADRs in the area, and use their words.
- Finding facts is your job, not mine. Send a `scoper` agent to find where code lives, what tests exist and what conventions apply, and don't ask me what you can look up. Don't wait for it: ask the questions that don't depend on its answer now.

## 2. Grill

Map the plan as a **design tree**: every decision branches into the decisions that hang off it. Work it in **rounds**. The **frontier** is every decision whose prerequisites are already settled. Ask the whole frontier in one round, each question numbered with your recommended answer, worded so "yes" accepts it. Wait for my answers, recompute the frontier, ask the next round. A question that depends on another still open in the round belongs to a later round.

```
❓ **Q1** - **<question title>**: <question body, may be several paragraphs or choices>

➡️ <your recommended answer>

---

❓ **Q2** - ...
```

Beyond what the plan itself raises, visit these branches before the frontier counts as empty:

- **Slicing.** Each issue must be doable in one agent session, including its own verification. If it can't be, split it. Each slice is vertical (a narrow path through every layer) and demoable or verifiable on its own.
- **Landing.** How does each slice reach the default branch without breaking it? Prefer shipping unfinished work dormant (behind a config flag, or an entry point nothing calls yet) over a long-lived integration branch. Every PR targets the default branch, so `Closes #N` works. If a slice can't land alone, say what it must land with.
- **Blockers.** Which issues genuinely gate which? Separate a true blocker (can't start or can't be verified without it) from a preferred order. Include existing open issues from phase 1.
- **Overlap.** Which directories or modules does each slice touch? Two slices touching the same ones shouldn't run in parallel.
- **Verification.** For each slice, which command or check proves it works? What needs a real-data or real-surface check I do by hand after merge? That goes in the issue, not in a later one.
- **Who and when.** Which work is mine (an owner action, a sign-off, a manual check, a decision) and which is an agent's? Which issues are waiting on a date or an outside party, and until when?
- **Order of attack.** Which slice comes first, and what does it unblock?

Do not act on any of it until I confirm we have a shared understanding.

## 3. Draft the breakdown

Break the plan into issues. Rules:

- **Tracer bullets, not layers.** Prefactor first ("make the change easy, then make the easy change").
- **Wide refactors** (one mechanical change whose blast radius spans the codebase) go expand-contract: add the new form beside the old, migrate callers in batches sized by blast radius (each batch its own issue, blocked by the expand), then delete the old form in an issue blocked by every batch. Every step stays green on the default branch. If the batches can't, stop and ask me.
- **No file paths or code in issue text**, since they go stale, with two exceptions: the `Files:` line below, and a snippet from a prototype that encodes a decision prose can't.

Show the breakdown as a numbered list. For each issue:

- **Title**
- **What it delivers**: the end-to-end behavior
- **Blocked by**: other draft issues or existing issue numbers, or "none"
- **Files**: the directories or modules it touches, for overlap checks only
- **Verified by**: the command or check, and any hand check
- **Who**: agent (`ready-for-agent`) or me (`ready-for-human`)
- **Not before**: a date, if time-gated (these also get `waiting`)

If there is no parent issue and the plan has three or more issues, propose an epic to hold them. Then ask me: is the granularity right, are the blockers real, should any be merged or split? Iterate until I approve.

## 4. Publish

Only after I approve. If there is no GitHub remote, stop here and tell me to run `/subagent-kit:repo-init`. If the standard labels are missing (`gh label list`), say so and tell me to run it too. Don't create labels yourself.

Create issues in dependency order, blockers first, so each can reference real numbers.

1. Write each issue body to a file in your scratchpad, then `gh issue create --title "<title>" --body-file <file> --label <labels>`. The last path segment of the printed URL is the number. Body layout:

   ```
   ## What to build

   <the end-to-end behavior, from the user's perspective>

   ## Acceptance criteria

   - [ ] <criterion>
   - [ ] <the verification from the draft, including any command to run>

   Files: <directories or modules>
   Not before: <YYYY-MM-DD>
   ```

   `Files:` and `Not before:` each sit alone on a line starting at the left margin, because `/subagent-kit:next` reads them there. Leave `Not before:` out when there is no date, and `Files:` out for an epic. Don't put `Closes` in an issue.
2. Labels: `ready-for-agent` or `ready-for-human` on every issue that is not an epic; add `waiting` when it has a `Not before:` date or waits on an outside party. An epic gets no `ready-` label.
3. Links, with `bash <this skill's base directory>/scripts/link.sh`:
   - `link.sh sub <parent> <child>` makes `<child>` a sub-issue of `<parent>`, for the epic and for an issue I named as the source.
   - `link.sh blocked-by <issue> <blocker>` sets GitHub's native "blocked by" edge. Set one per blocker, including existing issues. Write blockers as native edges, not as text in the body.
4. Never close or edit a parent or existing issue except to add the links.

## 5. Check

Run `next.sh` again. Every new issue must land where I expect: no blockers in Ready now, blocked ones in Blocked with the right blockers, my own in For a human, dated ones in Waiting, the epic in Epics. Fix any that don't (a missing edge or label), then give me a table: number, title, link, bucket. Finish with the first issue I should run, as a command like `/subagent-kit:issue 42`.

Don't start any of the work.
