#!/usr/bin/env bash
# Work-queue report for the /subagent-kit:next skill. Read-only: it only queries GitHub.
#   next.sh          print the report as text
#   next.sh --json   print the same data as JSON
# Run it anywhere inside the repository. Set GH_REPO=owner/name to look at another one.
set -u

fail() { echo "next.sh: $*" >&2; exit 1; }

format=text
case ${1:-} in
  "") ;;
  --json) format=json ;;
  *) echo "usage: ${0##*/} [--json]" >&2; exit 2 ;;
esac

command -v gh >/dev/null 2>&1 || fail "gh is not installed"
command -v jq >/dev/null 2>&1 || fail "jq is not installed"

slug=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null) || fail "no GitHub repository here (is there an origin remote, and is gh signed in?)"
owner=${slug%%/*}
name=${slug#*/}
today=$(date +%F)

QUERY='
query($o: String!, $n: String!) {
  repository(owner: $o, name: $n) {
    defaultBranchRef { name }
    issues(first: 100, states: OPEN, orderBy: {field: CREATED_AT, direction: ASC}) {
      totalCount
      nodes {
        number title url body
        labels(first: 20) { nodes { name } }
        assignees(first: 5) { nodes { login } }
        blockedBy(first: 20) { nodes { number state } }
        parent { number }
        subIssues(first: 100) { nodes { number state } }
        closedByPullRequestsReferences(first: 5, includeClosedPrs: false) { nodes { number } }
      }
    }
    pullRequests(states: OPEN, first: 100) {
      nodes {
        number title url isDraft baseRefName headRefName reviewDecision
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}'

data=$(gh api graphql -f query="$QUERY" -f o="$owner" -f n="$name") || fail "GitHub query failed"

# Each open issue lands in the first bucket that fits:
#   epic       has sub-issues: a container, shown as progress, never as work
#   in_flight  has an open PR (named by a closing keyword, or from a branch called issue-<n>-...)
#   blocked    has an open "blocked by" issue
#   waiting    labeled waiting or blocked, or carries a "Not before:" date still ahead
#   triage     labeled needs-triage or needs-info
#   human      labeled ready-for-human
#   ready      everything else; "labeled" says whether it carries ready-for-agent
report=$(jq --arg today "$today" --arg slug "$slug" '
  .data.repository as $r
  | ($r.pullRequests.nodes) as $prs
  | def labels: [.labels.nodes[].name];
    def pr_state: (.commits.nodes[0].commit.statusCheckRollup.state // "NONE");
    def prs_for($n; $linked):
      [ $prs[] | select(
          (.number as $p | $linked | index($p)) != null
          or (.headRefName | test("^issue-" + ($n | tostring) + "(-|$)")))
        | {number, title, url, base: .baseRefName, draft: .isDraft, checks: pr_state, review: .reviewDecision} ];
    ($r.issues.nodes | map(
      . as $i
      | ($i.body // "") as $body
      | {
          number, title, url,
          labels: ($i | labels),
          assignees: [.assignees.nodes[].login],
          parent: (.parent.number),
          blockers: [.blockedBy.nodes[] | select(.state == "OPEN") | .number],
          subs: {total: (.subIssues.nodes | length), open: ([.subIssues.nodes[] | select(.state == "OPEN")] | length)},
          not_before: (($body | capture("(?im)^[ \\t]*not before:[ \\t]*(?<d>[0-9]{4}-[0-9]{2}-[0-9]{2})") | .d) // null),
          files: (($body | capture("(?im)^[ \\t]*files:[ \\t]*(?<f>[^\\r\\n]+)") | .f) // null),
          prs: prs_for($i.number; [.closedByPullRequestsReferences.nodes[].number])
        }
      | .gate_reached = (.not_before != null and .not_before <= $today)
      | .bucket = (
          if .subs.total > 0 then "epic"
          elif (.prs | length) > 0 then "in_flight"
          elif (.blockers | length) > 0 then "blocked"
          elif ((.labels | index("waiting")) != null or (.labels | index("blocked")) != null
                or (.not_before != null and .not_before > $today)) then "waiting"
          elif ((.labels | index("needs-triage")) != null or (.labels | index("needs-info")) != null) then "triage"
          elif (.labels | index("ready-for-human")) != null then "human"
          else "ready" end)
      | .labeled = ((.labels | index("ready-for-agent")) != null)
    )) as $issues
  | {
      repo: $slug,
      default_branch: $r.defaultBranchRef.name,
      today: $today,
      open_issues: $r.issues.totalCount,
      truncated: ($r.issues.totalCount > ($r.issues.nodes | length)),
      ready: [$issues[] | select(.bucket == "ready")],
      in_flight: [$issues[] | select(.bucket == "in_flight")],
      blocked: [$issues[] | select(.bucket == "blocked")],
      waiting: [$issues[] | select(.bucket == "waiting")],
      human: [$issues[] | select(.bucket == "human")],
      triage: [$issues[] | select(.bucket == "triage")],
      epics: [$issues[] | select(.bucket == "epic")],
      prs: [$prs[] | {number, title, url, base: .baseRefName, head: .headRefName, draft: .isDraft, checks: pr_state, review: .reviewDecision}]
    }' <<<"$data") || fail "could not process the GitHub response"

if [ "$format" = json ]; then
  printf '%s\n' "$report"
  exit 0
fi

jq -r '
  def who: if (.assignees | length) > 0 then "  (" + (.assignees | join(", ")) + ")" else "" end;
  def extra: [ (if .files then "files: " + .files else empty end) ] | if length > 0 then "  [" + join("; ") + "]" else "" end;
  def section($title; $items; line):
    "\n== \($title) (\($items | length))",
    (if ($items | length) == 0 then "  none" else ($items[] | "  " + line) end);

  "\(.repo)  default branch: \(.default_branch)  today: \(.today)",
  (if .truncated then "WARNING: \(.open_issues) open issues, only the oldest 100 were read" else empty end),

  section("Ready now"; .ready;
    "#\(.number) \(.title)" + (if .labeled then "" else "  [not labeled ready-for-agent]" end)
    + (if .gate_reached then "  [Not before \(.not_before) has passed]" else "" end) + who + extra),

  section("In flight"; .in_flight;
    "#\(.number) \(.title)" + who + "\n" + ([.prs[] | "      PR #\(.number) -> \(.base)  checks: \(.checks | ascii_downcase)  review: \(.review // "none" | ascii_downcase)" + (if .draft then "  draft" else "" end)] | join("\n"))),

  section("Blocked"; .blocked;
    "#\(.number) \(.title)  blocked by " + ([.blockers[] | "#\(.)"] | join(", "))),

  section("Waiting"; .waiting;
    "#\(.number) \(.title)  " + (if .not_before then "not before \(.not_before)" else "no date given" end)
    + (if (.labels | index("blocked")) then "  [labeled blocked]" else "" end)),

  section("For a human"; .human; "#\(.number) \(.title)" + who),

  section("Needs triage"; .triage; "#\(.number) \(.title)  [" + ([.labels[] | select(. == "needs-triage" or . == "needs-info")] | join(", ")) + "]"),

  section("Epics"; .epics;
    "#\(.number) \(.title)  \(.subs.total - .subs.open)/\(.subs.total) sub-issues done"
    + (if .subs.open == 0 then "  <- all done, close it" else "" end)),

  section("Open PRs"; .prs;
    "#\(.number) \(.title)  \(.head) -> \(.base)"
    + (if .base != $default then "  [not the default branch]" else "" end)
    + "  checks: \(.checks | ascii_downcase)  review: \(.review // "none" | ascii_downcase)"
    + (if .draft then "  draft" else "" end))
' --arg default "$(jq -r .default_branch <<<"$report")" <<<"$report"
