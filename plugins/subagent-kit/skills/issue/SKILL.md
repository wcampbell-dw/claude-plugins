---
name: issue
description: Work a GitHub issue end to end in its own worktree, open a ready-for-review PR, then remove the worktree.
disable-model-invocation: true
argument-hint: <issue-number>
---

Work on GitHub issue #$ARGUMENTS from start to a ready-for-review pull request.

Typing this command is my explicit request to assign the issue to me, commit, push and open a ready-for-review PR (not a draft) for this issue. Do not ask before doing those steps. Stop and ask only for the cases listed under "When to stop".

## 1. Set up

1. Run `gh issue view $ARGUMENTS --json number,title,state,body,comments,labels,assignees`. Plain `--comments` can print nothing. If the issue is closed or the number is not an issue, stop.
2. Assign the issue to me with `gh issue edit $ARGUMENTS --add-assignee @me`. This leaves any existing assignees in place. If it fails, report the error and carry on.
3. From the main checkout, find the default branch with `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` and run `git fetch origin`.
4. Make sure `.claude/worktrees/` is ignored. If `git check-ignore -q .claude/worktrees` fails, append `.claude/worktrees/` to `.git/info/exclude` (local only, never commit it).
5. Get into the issue's worktree with the `EnterWorktree` tool. It moves this session, its shells and its subagents into the worktree, and blocks commands aimed at the main checkout, so do everything the main checkout needs (steps 3 and 4) before this step. Take the first case that applies:
   - The worktree `.claude/worktrees/issue-$ARGUMENTS` exists (`git worktree list`): call `EnterWorktree` with its `path`.
   - A branch for the issue exists, locally (`git branch --list 'issue-$ARGUMENTS-*'`) or only on the remote (`git branch -r --list 'origin/issue-$ARGUMENTS-*'`): create the worktree on it with `git worktree add .claude/worktrees/issue-$ARGUMENTS <branch>` (for a remote-only branch, `git worktree add --track -b <branch> .claude/worktrees/issue-$ARGUMENTS origin/<branch>`). Then run `bash <this skill's base directory>/scripts/worktree.sh include .claude/worktrees/issue-$ARGUMENTS` to copy the gitignored files the repository lists in `.worktreeinclude`, and call `EnterWorktree` with the `path`. Continue from the branch's state.
   - Otherwise call `EnterWorktree` with `name: "issue-$ARGUMENTS"`. Claude Code creates the worktree from `origin/<default-branch>` and copies the `.worktreeinclude` files itself. Rename its branch with `git branch -m issue-$ARGUMENTS-<short-slug>`. If `git rev-parse HEAD` does not match `origin/<default-branch>` (the user's `worktree.baseRef` setting can change the base), run `git reset --hard origin/<default-branch>`. The worktree is new, so this loses nothing.
6. Gitignored files the build needs that `.worktreeinclude` does not cover, such as local settings or secrets, are not in the worktree. Copy the ones you need from the main checkout. If you had to copy any, mention in the final message that `/subagent-kit:worktree-include` can add them to `.worktreeinclude` so the next worktree gets them.
7. Do all work inside the worktree. Still give every `scoper`, `implementer` and `shipper` run the worktree's absolute path and tell it to work only there. Run each command plainly from the worktree root: the isolation checks refuse `cd ... &&` chains.
8. Other `/issue` sessions may be running in sibling worktrees. Never touch another issue's worktree.

## 2. Build it

Follow DELEGATION.md for scoping, implementation, your own review and verification. In addition:

- Run `reviewer` as DELEGATION.md describes, and address its confirmed findings before shipping.
- Before shipping, make sure the project's full relevant test suite and linters have passed in the worktree on the final code. Run them only if the implementer did not, or if the code changed after its run.

## 3. Ship

Hand off to `shipper` with: the worktree path, the exact files, a commit message that matches the style of `git log --oneline -20`, and the steps commit, push, and open a ready-for-review PR. Write the PR body yourself: summary, what was verified, and `Closes #$ARGUMENTS`.

## 4. Clean up

After the PR is open:

1. Stop anything you started from the worktree that may hold files open: background shells, monitors, and any local host, emulator or watcher you launched there.
2. Call `ExitWorktree` with `action: "keep"` to return to the main checkout. Do not use `"remove"`: it would ask to discard the branch's commits, and it does not handle Windows file locks.
3. From the main checkout, run `bash <this skill's base directory>/scripts/worktree.sh remove .claude/worktrees/issue-$ARGUMENTS`. It removes the worktree only if it has no uncommitted or untracked files and its branch is pushed. An untracked file identical to the main checkout's copy, such as the `.claude/settings.local.json` Claude Code copies in, doesn't count and is deleted. It unlocks the worktree, shuts down .NET build servers, retries through Windows file locks, deletes leftover gitignored files once git has let go of the folder, and deletes the local branch.
4. If it exits non-zero, it has kept what it could not safely remove and says why. Report that and leave it. Never fall back to `--force`, `-D` or deleting the folder by hand.

The remote branch stays for the PR. To address review comments later, run `/issue $ARGUMENTS` again. Step 1.5 picks up the existing branch, from the remote if the local one is gone.

## When to stop

Stop and ask me only when:

- the issue is ambiguous enough that reasonable readers would build different things
- the real scope is much larger than the issue describes, or needs an architectural decision I should make
- verification still fails after a reasonable fix attempt. A test run that was killed or interrupted, for example by low memory or a timeout, has not failed: rerun it once (alone, or in smaller pieces if memory was the cause) before stopping.
- shipper stops on a pre-flight problem you cannot fix yourself

## Final message

Give the PR link, one line on what was verified, and anything left behind (a kept worktree or branch and why).
