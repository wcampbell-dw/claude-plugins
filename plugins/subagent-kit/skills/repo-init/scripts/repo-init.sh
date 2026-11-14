#!/usr/bin/env bash
# Repository setup helper for the /subagent-kit:repo-init skill. Run it from the repository root.
#   repo-init.sh status                    print what is and is not set up, as lines of key=value
#   repo-init.sh create [--public] [name]  create the GitHub repository and add it as origin
#   repo-init.sh labels                    create the standard labels that are missing
#   repo-init.sh merge-settings            allow only squash merges and delete merged branches
#   repo-init.sh workflow                  copy the auto-close workflow into .github/workflows
#   repo-init.sh pr-template               copy the pull request template into .github
#   repo-init.sh line-endings              write a .gitattributes that keeps LF line endings
#   repo-init.sh commit pr|direct [path...] commit the setup files that are still untracked
#                                          pr: one commit on a new branch off origin's default
#                                              branch, built without a checkout, pushed, with a
#                                              pull request opened
#                                          direct: on the current branch, pushed when origin exists
# Every command is safe to run again: it only adds what is missing and never deletes or edits a
# label or file that exists. commit takes only the files it is given, or by default the setup files
# (workflow, pull request template, .gitattributes, CLAUDE.md) that git does not track yet, and
# leaves everything else in the working tree alone. Set GH_REPO=owner/name to aim the labels and
# merge-settings commands at another repository.
set -u

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKFLOW_TEMPLATE="$HERE/../templates/close-linked-issues.yml"
WORKFLOW_PATH=.github/workflows/close-linked-issues.yml
PR_TEMPLATE="$HERE/../templates/pull_request_template.md"
PR_TEMPLATE_PATH=.github/pull_request_template.md
SETUP_FILES=("$WORKFLOW_PATH" "$PR_TEMPLATE_PATH" .gitattributes CLAUDE.md)
EOL_RULE='* text=auto eol=lf'
COMMIT_TITLE="Set up the repository for the issue workflow"

# name|color|description. The first five match the labels the triage skills expect.
LABELS=(
  "needs-triage|FBCA04|Maintainer needs to evaluate this issue"
  "needs-info|D4C5F9|Waiting on reporter for more information"
  "ready-for-agent|0E8A16|Fully specified, ready for an AFK agent"
  "ready-for-human|1D76DB|Requires human implementation"
  "waiting|C5DEF5|Waiting on a date or an outside party; the issue says which"
)

fail() { echo "repo-init.sh: $*" >&2; exit 1; }

need_gh() {
  command -v gh >/dev/null 2>&1 || fail "gh is not installed"
  gh auth status >/dev/null 2>&1 || fail "gh is not signed in (run: gh auth login)"
}

has_remote() { [ -n "$(git remote get-url origin 2>/dev/null)" ]; }

# Print the pull request template GitHub would use, if any: pull_request_template.md in the root,
# .github or docs (any letter case), or a PULL_REQUEST_TEMPLATE folder in one of them.
existing_pr_template() {
  local dir f
  for dir in .github . docs; do
    [ -d "$dir" ] || continue
    for f in "$dir"/* "$dir"/.[!.]*; do
      [ -e "$f" ] || continue
      case $(basename "$f" | tr '[:upper:]' '[:lower:]') in
        pull_request_template.md|pull_request_template) echo "${f#./}"; return 0 ;;
      esac
    done
  done
  return 1
}

repo_slug() { gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null; }

# The GitHub repository's default branch; empty while it has no commits.
remote_default() { gh repo view --json defaultBranchRef -q '.defaultBranchRef.name // empty' 2>/dev/null; }

# Print the project instructions file /init would have written, if any.
existing_claude_md() {
  local f
  for f in CLAUDE.md .claude/CLAUDE.md AGENTS.md; do
    [ -f "$f" ] && { echo "$f"; return 0; }
  done
  return 1
}

# Print the setup files that exist but git does not track yet, one per line.
uncommitted_setup_files() {
  local f
  for f in "${SETUP_FILES[@]}"; do
    [ -f "$f" ] && ! git ls-files --error-unmatch -- "$f" >/dev/null 2>&1 && echo "$f"
  done
  return 0
}

status() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "git=no"; return 0; }
  echo "git=yes"
  echo "commits=$(git rev-list --count HEAD 2>/dev/null || echo 0)"
  echo "branch=$(git branch --show-current)"
  if has_remote; then
    echo "origin=$(git remote get-url origin)"
  else
    echo "origin=none"
  fi
  [ -f "$WORKFLOW_PATH" ] && echo "workflow=present" || echo "workflow=missing"
  local tpl; tpl=$(existing_pr_template) && echo "pr_template=$tpl" || echo "pr_template=missing"
  local cm; cm=$(existing_claude_md) && echo "claude_md=$cm" || echo "claude_md=missing"
  # Files in the folder besides the setup files, so an empty new repository can skip /init.
  echo "other_files=$(git ls-files -co --exclude-standard | grep -Ecv '^(\.github/|\.gitattributes$|CLAUDE\.md$)')"
  echo "uncommitted=$(uncommitted_setup_files | paste -sd ' ' -)"
  case $(uname -s) in MINGW*|MSYS*|CYGWIN*) echo "os=windows" ;; *) echo "os=other" ;; esac
  [ -f .gitattributes ] && echo "gitattributes=present" || echo "gitattributes=missing"
  # Committed files stored with CRLF; .gitattributes alone does not convert them.
  echo "crlf_files=$(git ls-files --eol 2>/dev/null | grep -c '^i/crlf')"
  need_gh 2>/dev/null || { echo "gh=unavailable"; return 0; }
  echo "gh=ok"
  local slug; slug=$(repo_slug)
  [ -n "$slug" ] || return 0
  echo "repo=$slug"
  echo "remote_default=$(remote_default)"
  echo "setup_pr=$(gh pr list --state open --json headRefName,url \
    -q '[.[] | select(.headRefName | test("^repo-init(-[0-9]+)?$")) | .url] | first // empty' 2>/dev/null)"
  local have missing=() entry name
  have=$(gh label list --limit 200 --json name -q '.[].name')
  for entry in "${LABELS[@]}"; do
    name=${entry%%|*}
    printf '%s\n' "$have" | grep -Fxq "$name" || missing+=("$name")
  done
  echo "labels_missing=${missing[*]:-}"
  gh api "repos/$slug" -q '"squash_only=" + ((.allow_squash_merge and (.allow_merge_commit|not) and (.allow_rebase_merge|not))|tostring), "delete_branch_on_merge=" + (.delete_branch_on_merge|tostring), "visibility=" + .visibility' 2>/dev/null
}

create() {
  local visibility=--private name=
  while [ $# -gt 0 ]; do
    case $1 in
      --public) visibility=--public ;;
      -*) fail "unknown option: $1" ;;
      *) name=$1 ;;
    esac
    shift
  done
  need_gh
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "not inside a git repository (run git init first)"
  has_remote && fail "origin already exists: $(git remote get-url origin)"
  [ -n "$name" ] || name=$(basename "$(git rev-parse --show-toplevel)")
  # --source adds the remote; with no --push nothing is uploaded yet.
  gh repo create "$name" "$visibility" --source . --remote origin || fail "gh repo create failed"
  echo "created $(repo_slug) (${visibility#--}), origin added, nothing pushed yet"
}

labels() {
  need_gh
  local have entry name color desc created=0
  have=$(gh label list --limit 200 --json name -q '.[].name') || fail "could not list labels"
  for entry in "${LABELS[@]}"; do
    IFS='|' read -r name color desc <<<"$entry"
    if printf '%s\n' "$have" | grep -Fxq "$name"; then
      echo "kept     $name"
    elif gh label create "$name" --color "$color" --description "$desc" >/dev/null; then
      echo "created  $name"; created=$((created + 1))
    else
      fail "could not create label $name"
    fi
  done
  echo "$created label(s) created"
}

merge_settings() {
  need_gh
  local slug; slug=$(repo_slug)
  [ -n "$slug" ] || fail "no GitHub repository for this folder (run: repo-init.sh create)"
  gh api -X PATCH "repos/$slug" \
    -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false \
    -F delete_branch_on_merge=true -F squash_merge_commit_title=PR_TITLE -F squash_merge_commit_message=PR_BODY \
    >/dev/null || fail "could not update $slug (repository admin rights needed)"
  echo "$slug: squash merges only, merged branches deleted"
}

workflow() {
  [ -f "$WORKFLOW_TEMPLATE" ] || fail "template missing: $WORKFLOW_TEMPLATE"
  if [ -f "$WORKFLOW_PATH" ]; then
    if cmp -s "$WORKFLOW_TEMPLATE" "$WORKFLOW_PATH"; then
      echo "kept     $WORKFLOW_PATH (already current)"
    else
      echo "kept     $WORKFLOW_PATH (differs from the template; not overwritten)"
    fi
    return 0
  fi
  mkdir -p "$(dirname "$WORKFLOW_PATH")" && cp "$WORKFLOW_TEMPLATE" "$WORKFLOW_PATH" || fail "could not write $WORKFLOW_PATH"
  echo "created  $WORKFLOW_PATH (not committed)"
}

pr_template() {
  [ -f "$PR_TEMPLATE" ] || fail "template missing: $PR_TEMPLATE"
  local existing
  if existing=$(existing_pr_template); then
    if [ -f "$existing" ] && cmp -s "$PR_TEMPLATE" "$existing"; then
      echo "kept     $existing (already current)"
    else
      echo "kept     $existing (GitHub already uses it; not overwritten)"
    fi
    return 0
  fi
  mkdir -p "$(dirname "$PR_TEMPLATE_PATH")" && cp "$PR_TEMPLATE" "$PR_TEMPLATE_PATH" || fail "could not write $PR_TEMPLATE_PATH"
  echo "created  $PR_TEMPLATE_PATH (not committed)"
}

# What each setup file is for, as a Markdown bullet.
describe() {
  case $1 in
    "$WORKFLOW_PATH") echo "- \`$1\`: closes the issues a PR names when it merges into a branch other than the default one. GitHub does that itself only for the default branch." ;;
    "$PR_TEMPLATE_PATH") echo "- \`$1\`: asks each PR for why it was made, what changed and how it was checked." ;;
    CLAUDE.md) echo "- \`$1\`: project notes for Claude Code, written by \`/init\`." ;;
    .gitattributes) echo "- \`$1\`: keeps LF line endings in every checkout, so shell scripts and workflows still work when the repository is cloned on Windows." ;;
    *) echo "- \`$1\`" ;;
  esac
}

pr_body() {
  local f
  printf '## Summary\n\nSets the repository up for the issue workflow with `/subagent-kit:repo-init`.\n\n'
  for f in "$@"; do describe "$f"; done
  printf '\n## Verification\n\n'
  printf 'The workflow and template are copied unchanged from the subagent-kit templates.'
  case " $* " in *" CLAUDE.md "*) printf ' `CLAUDE.md` was written by `/init`; read it over before merging.' ;; esac
  printf '\n'
  case " $* " in *" $WORKFLOW_PATH "*) printf '\nNot checked yet: the workflow only runs once it is on the default branch. Check it on the first PR merged into another branch.\n' ;; esac
}

commit_files() {
  local mode=${1:-}
  case $mode in pr|direct) shift ;; *) fail "usage: commit pr|direct [path...]" ;; esac
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "not inside a git repository"
  local files=("$@") f
  [ ${#files[@]} -gt 0 ] || mapfile -t files < <(uncommitted_setup_files)
  [ ${#files[@]} -gt 0 ] || { echo "nothing to commit"; return 0; }
  for f in "${files[@]}"; do [ -e "$f" ] || fail "no such file: $f"; done
  local msg; msg=$(printf '%s\n\n' "$COMMIT_TITLE"; for f in "${files[@]}"; do describe "$f"; done)

  if [ "$mode" = direct ]; then
    git add -- "${files[@]}" || fail "git add failed"
    git commit -q -m "$msg" -- "${files[@]}" || fail "git commit failed"
    echo "committed ${files[*]} on $(git branch --show-current)"
    if has_remote; then
      git push -q -u origin HEAD || fail "git push failed; the commit is kept locally"
      echo "pushed to origin/$(git branch --show-current)"
    fi
    return 0
  fi

  need_gh
  has_remote || fail "no origin to open a pull request against; use: commit direct"
  local base; base=$(remote_default)
  [ -n "$base" ] || fail "the GitHub repository has no default branch yet; use: commit direct"
  git fetch -q origin "$base" || fail "could not fetch origin/$base"
  local branch=repo-init n=1
  while git show-ref --quiet "refs/heads/$branch" || git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; do
    n=$((n + 1)); branch=repo-init-$n
  done
  # Build the commit in a throwaway index on top of origin/$base, so the current branch, its
  # staged changes and its working tree are never touched and no checkout can be refused.
  local index tree commit
  index="$(git rev-parse --absolute-git-dir)/repo-init-index"
  rm -f "$index"
  tree=$(
    export GIT_INDEX_FILE="$index"
    git read-tree "origin/$base" || exit 1
    for f in "${files[@]}"; do
      git update-index --add --cacheinfo "100644,$(git hash-object -w -- "$f"),$f" || exit 1
    done
    git write-tree
  ) || { rm -f "$index"; fail "could not build the commit"; }
  rm -f "$index"
  commit=$(git commit-tree "$tree" -p "origin/$base" -m "$msg") || fail "git commit-tree failed"
  git branch -q "$branch" "$commit" || fail "could not create branch $branch"
  git push -q -u origin "$branch" || fail "git push failed; the commit is on local branch $branch"
  # The files now live on $branch. Remove the untracked copies, or pulling $base after the
  # merge would stop on them.
  rm -f -- "${files[@]}"
  local url
  url=$(gh pr create --base "$base" --head "$branch" --title "$COMMIT_TITLE" --body "$(pr_body "${files[@]}")") \
    || fail "gh pr create failed; $branch is pushed, open the PR by hand"
  echo "opened $url from $branch into $base"
  echo "the files are on $branch until it merges; this working tree was left as it was"
}

line_endings() {
  if [ -f .gitattributes ]; then
    grep -Eq '^\*[[:space:]].*eol=' .gitattributes \
      && echo "kept     .gitattributes (already sets eol)" \
      || echo "kept     .gitattributes (sets no repository-wide eol; not edited)"
    return 0
  fi
  printf '%s\n' "$EOL_RULE" > .gitattributes || fail "could not write .gitattributes"
  echo "created  .gitattributes ($EOL_RULE, not committed)"
}

case ${1:-} in
  status) shift; status ;;
  create) shift; create "$@" ;;
  labels) shift; labels ;;
  merge-settings) shift; merge_settings ;;
  workflow) shift; workflow ;;
  pr-template) shift; pr_template ;;
  line-endings) shift; line_endings ;;
  commit) shift; commit_files "$@" ;;
  *) echo "usage: ${0##*/} status|create [--public] [name]|labels|merge-settings|workflow|pr-template|line-endings|commit pr|direct [path...]" >&2; exit 2 ;;
esac
