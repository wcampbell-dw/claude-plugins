#!/usr/bin/env bash
# Repository setup helper for the /subagent-kit:repo-init skill. Run it from the repository root.
#   repo-init.sh status                    print what is and is not set up, as lines of key=value
#   repo-init.sh create [--public] [name]  create the GitHub repository and add it as origin
#   repo-init.sh labels                    create the standard labels that are missing
#   repo-init.sh merge-settings            allow only squash merges and delete merged branches
#   repo-init.sh workflow                  copy the auto-close workflow into .github/workflows
# Every command is safe to run again: it only adds what is missing and never deletes or edits a
# label or file that exists. Set GH_REPO=owner/name to aim the labels and merge-settings commands
# at another repository.
set -u

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
WORKFLOW_TEMPLATE="$HERE/../templates/close-linked-issues.yml"
WORKFLOW_PATH=.github/workflows/close-linked-issues.yml

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

repo_slug() { gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null; }

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
  need_gh 2>/dev/null || { echo "gh=unavailable"; return 0; }
  echo "gh=ok"
  local slug; slug=$(repo_slug)
  [ -n "$slug" ] || return 0
  echo "repo=$slug"
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

case ${1:-} in
  status) shift; status ;;
  create) shift; create "$@" ;;
  labels) shift; labels ;;
  merge-settings) shift; merge_settings ;;
  workflow) shift; workflow ;;
  *) echo "usage: ${0##*/} status|create [--public] [name]|labels|merge-settings|workflow" >&2; exit 2 ;;
esac
