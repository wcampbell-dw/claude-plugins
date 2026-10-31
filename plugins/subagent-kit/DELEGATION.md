# Subagent delegation (subagent-kit)

## Delegate implementation to the implementer agent

This is a standing request to use subagents. Do not wait for me to ask.

- Once the task is sufficiently understood and the intended solution is clear, hand substantial, well-defined code or test changes to the `subagent-kit:implementer` agent. This covers new features, bug fixes, refactors, and adding or fixing tests.
- Delegate when the change spans several files or you expect more than one edit-and-test cycle. Make the edit yourself when the change is small and already fully known, even if it is a few dozen lines, because writing the handoff and reviewing the diff would cost about as much as doing it.
- Give the implementer the issue number, acceptance criteria, relevant files, architectural constraints, decisions already made, important edge cases, and the validation commands to run. It starts with no context, so do not make it rediscover what you already know.
- Keep architectural decisions, ambiguous scope decisions, root-cause analysis, and other judgment-heavy work in the main session. The implementer should execute a sufficiently defined solution rather than independently redesign the task.
- Split work larger than one subsystem into file-owned or subsystem-owned slices and give each independent slice to its own implementer run. Start dependent slices only after the slices they depend on are complete.
- An isolated worktree branches from the current commit, so uncommitted or unmerged files are not in it. Before dispatching with `isolation: "worktree"`, commit the files the implementer needs (plans, ADRs, earlier slices) or paste the plan into the prompt.
- When spawning `general-purpose` for writing, research or other non-judgment work, pass `model: "sonnet"` (or `"haiku"` for mechanical lookups). Without it the agent inherits the main session's Opus.

## Scope unfamiliar tasks with the scoper agent

- At the start of a non-trivial task whose code you do not know yet, run the `subagent-kit:scoper` agent to collect the goal, acceptance criteria, relevant files, tests and a possible split.
- Skip it when you expect to read 3 or fewer files you have not already read in this session, or when you already know the area well enough to name the files and symbols involved.
- Keep its prompt short: the goal, the issue number, any repo reading rules, and at most 4 questions about where things are (files, symbols, tests, conventions to follow). Do not ask it for design analysis or a walkthrough of how a whole subsystem works. Do that yourself after reading the files it points to.
- Data or network checks that scoper cannot run stay with the main session and must not be skipped.
- Treat its report as input, not as a decision. It runs on a small model, so spot-check the files it names before you build a plan on them. You still own scope, architecture and any split-or-combine decision.
- You always write the plan. When the scoper flags the task as complex, ambiguous or risky, read the key files it names yourself before planning, instead of spot-checking.

## Ship with the shipper agent

- When I ask you to commit, push or open a pull request, hand the git and GitHub steps to the `subagent-kit:shipper` agent once your review and verification are done.
- Tell it exactly which steps I asked for, which files belong to the change, the commit message, the issue number if there is one, and the verification you ran. It does not run tests and does not edit files.
- If it stops on a pre-flight problem such as an unrelated file or a missing changelog entry, fix the problem yourself and run it again.
- Do small git operations yourself when a handoff would cost more, such as a single follow-up commit on an open PR.
- Print the pull request link it returns in your final response.

## Main agent responsibilities

Do these yourself:

- Read and understand the issue or request.
- Investigate unclear behavior and determine the likely root cause before delegating when practical.
- Decide scope, architecture, and implementation strategy.
- Perform branch setup and other git operations. Delegate commits, pushes and pull requests to `subagent-kit:shipper` as described above.
- Review every implementation returned by the implementer.
- Run the validation the implementer did not run: broader suites, integration or end-to-end checks, and targeted checks where the diff raises doubts. Do not re-run a command the implementer reported passing unless the code it covers has changed since that run.
- Start a run you expect to take more than a few minutes with `run_in_background` and keep reviewing while it runs. Wait for its completion notification instead of polling the output file.
- Perform the final end-to-end check on the real surface when applicable.
- Decide whether the task is actually complete.

## Mandatory review after implementation

After the implementer returns, do not rely on its summary or its statement that tests passed as proof that the work is correct.

Before reporting the task as complete:

1. Inspect the actual git diff.
2. Read the important changed code.
3. Compare the implementation with the original request, acceptance criteria, and agreed plan.
4. Inspect relevant callers, interfaces, neighboring code, and integration points where defects could have been introduced.
5. Check that tests cover the important changed behavior, including meaningful edge cases and failure cases where appropriate.
6. Look specifically for:
   - incorrect assumptions
   - missing cases
   - regressions
   - architectural inconsistencies
   - unnecessary scope expansion
   - weakened or insufficient tests
   - behavior that passes tests but does not satisfy the real requirement
7. Run additional targeted tests or checks when the diff raises doubts.

If you find a concrete implementation defect:

- Delegate the correction back to the `subagent-kit:implementer` when it is substantial, then review the new diff again. Continue the same implementer with `SendMessage` so it keeps its context. Spawn a new one only if the original is gone.
- Fix it yourself when the correction is small and easier than another handoff.

Do not duplicate the entire implementation merely to verify it. Review proportionally to the complexity and risk of the change.

When re-reviewing after fixes (including repeat `/code-review` runs on the same PR), review only the commits since the last review, not the whole change again. If a second round finds new defects in the same module, stop fixing piecemeal and tell me it looks like a design problem; propose an ADR or a grilling session instead of another fix round.

## Independent review with the reviewer agent

- Run the `subagent-kit:reviewer` agent on every change headed for a commit or PR, in addition to your own review. Skip it only for trivial changes: docs or comment wording, formatting, or a one-line change whose effect you can see in full.
- Start it with `run_in_background` once the diff is ready, and do your own review while it runs. Give it the request or issue, the agreed plan, and how to see the diff (for example `git diff main...HEAD`).
- Treat its findings as input. Check each one against the code before acting on it, and say which ones you rejected and why.
- Pick the model and effort for each run from the change, overriding the agent's default of Sonnet at `high`:
  - Keep the default for ordinary features, bug fixes, refactors and test changes.
  - Pass `effort: "medium"` for a small, mechanical change: a rename, a config or dependency bump, or a diff of a few dozen lines in one file.
  - Pass `model: "opus"` for a change in the Escalation categories below, or one that could lose data. Add `effort: "xhigh"` for security-sensitive or concurrency changes.
  - Pass `model: "opus"` when I ask for a thorough or deep review, and follow any model or effort I name.
- After fixes, continue the same reviewer with `SendMessage` and point it at the commits since its last review, at the same model and effort.
- Do not also run other review agents or skills, such as `/code-review`, on the same change unless I ask.

## Escalation

Prefer keeping implementation in the main session instead of delegating when the change itself requires substantial unresolved judgment, such as:

- architecture-heavy refactors
- difficult concurrency or synchronization changes
- security-sensitive changes
- complex data migrations
- tricky state machines
- broad public API changes
- changes spanning many tightly coupled subsystems
- cases where the implementation repeatedly diverges from the agreed plan
