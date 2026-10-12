#!/usr/bin/env bash
# Claude Code status line (Nerd Font icons, terminal palette colors).
#   line 1: directory (Ctrl+click opens Explorer) ............ git branch + status (Ctrl+click opens GitHub)
#   line 2: model · effort │ context meter + token count
#   line 3: account │ 5-hour usage meter + reset │ 7-day usage meter + reset
# Process launches cost ~100ms+ each under Git Bash, so everything except jq and
# git status uses bash builtins, and helpers assign to variables instead of $(...).
# Claude Code cancels a run that is still going when the next update arrives, so slow work
# (git status, the account lookup, the usage logger) is cached or skipped where possible.
export LC_ALL=C.UTF-8    # so ${#s} counts characters, not bytes
IFS= read -rd '' input   # builtin; $(cat) would cost another process launch

cache_dir=~/.claude/statusline-cache
[ -d "$cache_dir" ] || mkdir -p "$cache_dir"
GIT_TTL=5        # seconds before cached git status is refreshed in the background
ACCOUNT_TTL=600  # seconds before the cached account name is re-read from ~/.claude.json
RIGHT_PAD=4      # columns kept free at the right edge of line 1

# One jq call for every field. -b stops Windows jq from emitting CRLF.
eval "$(jq -rb '@sh "
  cwd=\(.workspace.current_dir // .cwd // "")
  model=\(.model.display_name // .model.id // "?")
  effort=\(.effort.level // "")
  ctx=\(.context_window.used_percentage // "")
  ctx_tok=\(.context_window.total_input_tokens // 0)
  ctx_size=\(.context_window.context_window_size // 0)
  five=\(.rate_limits.five_hour.used_percentage // "")
  five_reset=\(.rate_limits.five_hour.resets_at // "")
  week=\(.rate_limits.seven_day.used_percentage // "")
  week_reset=\(.rate_limits.seven_day.resets_at // "")
  usage_key=\([.rate_limits.five_hour, .rate_limits.seven_day] | map(.used_percentage, .resets_at) | join("|"))
"' <<<"$input")"

# Feed the subagent-kit usage logger, only when the rate-limit numbers changed since it last
# finished. The marker is written after the logger succeeds, so a cancelled run is retried.
logger=~/.claude/subagent-kit/statusline.sh
seen="$cache_dir/usage-seen"
if [ -f "$logger" ] && [ -n "${usage_key//|/}" ]; then
  last_key=""; [ -f "$seen" ] && IFS= read -r last_key < "$seen"
  if [ "$usage_key" != "$last_key" ]; then
    { bash "$logger" <<<"$input" >/dev/null 2>&1 && printf '%s\n' "$usage_key" > "$seen"; } &
  fi
fi

# Colors come from the terminal's own 16-color palette, so the theme decides the actual shades.
E=$'\e'
RST="$E[0m"; BOLD="$E[1m"; NOBOLD="$E[22m"; ITALIC="$E[3m"
RED="$E[31m"; GREEN="$E[92m"; YELLOW="$E[33m"; BLUE="$E[34m"
MAGENTA="$E[35m"; CYAN="$E[36m"; GRAY="$E[90m"
SEP=" ${GRAY}│${RST} "

# Nerd Font glyphs
I_DIR=$'\uf07c'         # folder-open
I_BRANCH=$'\ue725'      # git branch
I_DETACHED=$'\uf417'    # git commit
I_MODEL=$'\U000f06a9'   # robot
I_EFFORT=$'\U000f04c5'  # speedometer
I_CTX=$'\U000f035b'     # memory chip
I_USER=$'\uf007'        # user
I_5H=$'\uf017'          # clock
I_7D=$'\uf073'          # calendar
I_RESET=$'\U000f0453'   # reload
I_AHEAD=$'\uf062'; I_BEHIND=$'\uf063'
I_STAGED=$'\uf067'; I_MODIFIED=$'\uf040'; I_UNTRACKED=$'\uf128'
I_CONFLICT=$'\uf071'; I_CLEAN=$'\uf00c'

# winpath VAR PATH: C:\x, C:/x or /c/x -> C:/x
winpath() {
  local p=${2//\\//}
  [[ $p =~ ^/([a-zA-Z])/(.*)$ ]] && p="${BASH_REMATCH[1]^^}:/${BASH_REMATCH[2]}"
  printf -v "$1" '%s' "$p"
}

# link VAR URL TEXT: OSC 8 hyperlink
link() { printf -v "$1" '%s' "$E]8;;$2$E\\$3$E]8;;$E\\"; }

# vislen VAR STRING: on-screen width, ignoring SGR colors and OSC 8 links
vislen() {
  local s=$2 pre rest
  while [[ $s == *"$E"* ]]; do
    pre=${s%%"$E"*}; rest=${s#*"$E"}
    if [[ $rest == ']'* ]]; then rest=${rest#*"$E\\"}; else rest=${rest#*m}; fi
    s=$pre$rest
  done
  printf -v "$1" '%d' "${#s}"
}

# bar VAR PCT COLOR: 10-cell meter
bar() {
  local pct=$2 width=10 filled i out="$3"
  filled=$(( (pct * width + 50) / 100 ))
  (( filled > width )) && filled=$width
  (( pct > 0 && filled == 0 )) && filled=1
  for (( i = 0; i < width; i++ )); do
    (( i == filled )) && out+="$RST$GRAY"
    (( i < filled )) && out+="━" || out+="─"   # heavy fill, light track
  done
  printf -v "$1" '%s' "$out$RST"
}

# color_for VAR PCT T1 T2: green below T1, yellow below T2, red from T2 up
color_for() {
  local c=$RED
  if   (( $2 < $3 )); then c=$GREEN
  elif (( $2 < $4 )); then c=$YELLOW
  fi
  printf -v "$1" '%s' "$c"
}

# tokens VAR N: 950, 50k, 1.2M
tokens() {
  local n=$2
  if   (( n >= 1000000 )); then printf -v "$1" '%d.%dM' $(( n / 1000000 )) $(( n % 1000000 / 100000 ))
  elif (( n >= 1000 ));    then printf -v "$1" '%dk' $(( n / 1000 ))
  else printf -v "$1" '%d' "$n"
  fi
  [[ ${!1} == *.0M ]] && printf -v "$1" '%s' "${!1/.0M/M}"
}

# remaining VAR EPOCH: time left as 4d3h, 2h05m or 12m
remaining() {
  local left=$(( $2 - EPOCHSECONDS ))
  (( left < 0 )) && left=0
  if   (( left >= 86400 )); then printf -v "$1" '%dd%dh' $(( left / 86400 )) $(( left % 86400 / 3600 ))
  elif (( left >= 3600 ));  then printf -v "$1" '%dh%02dm' $(( left / 3600 )) $(( left % 3600 / 60 ))
  else printf -v "$1" '%dm' $(( left / 60 ))
  fi
}

# usage_segment VAR ICON LABEL PCT RESET AT_FORMAT [nobar]: meter, percent and reset time
usage_segment() {
  local p=${4%.*} col b="" at rem out
  color_for col "$p" 50 80
  [ "$7" != nobar ] && { bar b "$p" "$col"; b+=" "; }
  out="${CYAN}$2${RST} ${GRAY}$3${RST} ${b}${col}${BOLD}${p}${NOBOLD}%${RST}"
  if [ -n "$5" ]; then
    printf -v at "$6" "$5"
    at=${at#0}; at=${at/ 0/ }   # 03:30pm -> 3:30pm, Mon 03pm -> Mon 3pm
    remaining rem "$5"
    out+=" ${GRAY}${I_RESET} ${at} ${ITALIC}${rem}${RST}"
  fi
  printf -v "$1" '%s' "$out"
}

# git_segment: sets $seg to the rendered branch + status for $cwd (repo root in $repo).
git_segment() {
  seg=""
  local st branch="" oid="" ahead=0 behind=0 staged=0 modified=0 untracked=0 conflicts=0
  local kind a b c _ remote="" line in_origin=0 web label url icon=$I_BRANCH gs=""
  st=$(git -C "$cwd" --no-optional-locks status --porcelain=v2 --branch 2>/dev/null) || return

  while IFS=' ' read -r kind a b c _; do
    case "$kind" in
      '#') case "$a" in
             branch.oid)  oid=${b:0:7} ;;
             branch.head) branch=$b ;;
             branch.ab)   ahead=${b#+}; behind=${c#-} ;;
           esac ;;
      1|2) [ "${a:0:1}" != . ] && (( staged++ )); [ "${a:1:1}" != . ] && (( modified++ )) ;;
      u)   (( conflicts++ )) ;;
      '?') (( untracked++ )) ;;
    esac
  done <<<"$st"

  # Read origin's URL straight from .git/config (saves a git launch); fall back to git for worktrees.
  if [ -f "$repo/.git/config" ]; then
    while IFS= read -r line; do
      line=${line%$'\r'}
      [[ $line =~ ^\[ ]] && { [[ $line == '[remote "origin"]' ]] && in_origin=1 || in_origin=0; continue; }
      (( in_origin )) && [[ $line =~ ^[[:space:]]*url[[:space:]]*=[[:space:]]*(.*)$ ]] && { remote=${BASH_REMATCH[1]}; break; }
    done < "$repo/.git/config"
  else
    remote=$(git -C "$cwd" remote get-url origin 2>/dev/null)
  fi
  web=$remote
  [[ $web =~ ^git@([^:]+):(.*)$ ]]          && web="https://${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  [[ $web =~ ^ssh://git@([^/]+)/(.*)$ ]]    && web="https://${BASH_REMATCH[1]}/${BASH_REMATCH[2]}"
  [[ $web =~ ^https://[^@/]+@(.*)$ ]]       && web="https://${BASH_REMATCH[1]}"   # strip embedded credentials
  web=${web%.git}

  if [ "$branch" = "(detached)" ]; then
    label=$oid; url="$web/commit/$oid"; icon=$I_DETACHED
  else
    label=$branch; url="$web/tree/$branch"
  fi
  [[ $web == https://* ]] && link label "$url" "$label"

  (( ahead ))     && gs+=" ${GREEN}${I_AHEAD}${ahead}${RST}"
  (( behind ))    && gs+=" ${RED}${I_BEHIND}${behind}${RST}"
  (( conflicts )) && gs+=" ${RED}${I_CONFLICT} ${conflicts}${RST}"
  (( staged ))    && gs+=" ${GREEN}${I_STAGED}${staged}${RST}"
  (( modified ))  && gs+=" ${YELLOW}${I_MODIFIED} ${modified}${RST}"
  (( untracked )) && gs+=" ${GRAY}${I_UNTRACKED}${untracked}${RST}"
  [ -z "$gs" ] && gs=" ${GREEN}${I_CLEAN}${RST}"

  seg="${MAGENTA}${icon} ${BOLD}${label}${RST}${gs}"
}

# ── line 1 left: directory ───────────────────────────────────────────
left=""
if [ -n "$cwd" ]; then
  winpath dir "$cwd"
  winpath home "${USERPROFILE:-$HOME}"
  shown=$dir
  [[ ${dir,,} == "${home,,}"* ]] && shown="~${dir:${#home}}"
  if (( ${#shown} > 50 )); then parent=${shown%/*}; shown="…/${parent##*/}/${shown##*/}"; fi
  link l "file:///${dir// /%20}" "$shown"
  left="${BLUE}${I_DIR} ${BOLD}${l}${RST}"
fi

# ── line 1 right: git (only inside a repo; cached per repo folder) ───
right=""
repo=""
if [ -n "$cwd" ]; then
  repo=$dir
  while [ -n "$repo" ] && [ ! -e "$repo/.git" ]; do [ "${repo%/*}" = "$repo" ] && repo="" || repo=${repo%/*}; done
fi
if [ -n "$repo" ]; then
  key=${dir,,}; key=${key//[^a-z0-9]/_}
  cache="$cache_dir/git2-$key"
  cached_at=0 seg=""
  [ -f "$cache" ] && { IFS= read -r cached_at; IFS= read -r seg; } < "$cache"

  if [ -z "$seg" ]; then
    # No cache yet: compute now.
    git_segment
    [ -n "$seg" ] && printf '%s\n%s\n' "$EPOCHSECONDS" "$seg" > "$cache"
  elif (( EPOCHSECONDS - cached_at > GIT_TTL )); then
    # Stale: show the cached value now and refresh in the background. Bumping the timestamp
    # first keeps overlapping runs from all launching their own refresh.
    printf '%s\n%s\n' "$EPOCHSECONDS" "$seg" > "$cache"
    { git_segment; [ -n "$seg" ] && printf '%s\n%s\n' "$EPOCHSECONDS" "$seg" > "$cache"; } >/dev/null 2>&1 &
  fi
  right=$seg
fi

line1=$left
if [ -n "$right" ]; then
  vislen lw "$left"; vislen rw "$right"
  gap=$(( ${COLUMNS:-80} - RIGHT_PAD - lw - rw ))
  (( gap < 2 )) && gap=2
  printf -v pad '%*s' "$gap" ''
  line1+="${pad}${right}"
fi

# ── line 2: model · effort │ context ─────────────────────────────────
line2="${MAGENTA}${I_MODEL} ${BOLD}${model}${RST}"
[ -n "$effort" ] && line2+="  ${YELLOW}${I_EFFORT} ${effort}${RST}"

# context: green <15%, yellow <25%, red from 25% up
if [ -n "$ctx" ]; then
  c=${ctx%.*}
  color_for col "$c" 15 25
  bar b "$c" "$col"
  tokens used "$ctx_tok"
  line2+="${SEP}${CYAN}${I_CTX}${RST} ${b} ${col}${BOLD}${c}${NOBOLD}%${RST} ${GRAY}${used}"
  (( ctx_size > 0 )) && { tokens size "$ctx_size"; line2+="/${size}"; }
  line2+="${RST}"
fi

# ── line 3: account │ 5h │ 7d ───────────────────────────────────────
# The account lives in ~/.claude.json (large, rewritten often), so cache it and refresh in the background.
acct_cache="$cache_dir/account"
read_account() {
  local a
  a=$(jq -rb '(.oauthAccount.emailAddress // "" | split("@")[0]) as $u | if $u != "" then $u else .oauthAccount.displayName // empty end' ~/.claude.json 2>/dev/null)
  printf '%s\n%s\n' "$EPOCHSECONDS" "$a" > "$acct_cache"
}
[ -f "$acct_cache" ] || read_account
acct_at=0 account=""
{ IFS= read -r acct_at; IFS= read -r account; } < "$acct_cache"
# Also refresh soon after ~/.claude.json changes, so a cswap switch shows up quickly.
acct_age=$(( EPOCHSECONDS - acct_at ))
if (( acct_age > ACCOUNT_TTL )) || { (( acct_age > 5 )) && [ ~/.claude.json -nt "$acct_cache" ]; }; then
  printf '%s\n%s\n' "$EPOCHSECONDS" "$account" > "$acct_cache"
  read_account >/dev/null 2>&1 &
fi

line3=""
[ -n "$account" ] && line3="${GREEN}${I_USER} ${BOLD}${account}${RST}"
if [ -n "$five" ]; then
  usage_segment s "$I_5H" 5h "$five" "$five_reset" '%(%I:%M%P)T'
  line3+="${line3:+$SEP}$s"
fi
if [ -n "$week" ]; then
  usage_segment s "$I_7D" 7d "$week" "$week_reset" '%(%a %I%P)T' nobar
  line3+="${line3:+$SEP}$s"
fi

printf '%s\n%s\n' "$line1" "$line2"
[ -n "$line3" ] && printf '%s\n' "$line3"
