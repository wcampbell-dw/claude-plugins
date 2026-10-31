import type { Engine, Register } from 'claude-code'

// Adds DELEGATION.md to the system prompt, the way an import line in ~/.claude/CLAUDE.md
// would. Only prompts that offer the Agent tool get it: the agents themselves cannot delegate.
const SECTION = 'subagent-kit:delegation'

// The shipper only publishes, so its Bash runs a fixed set of git and gh command shapes and
// nothing else. Text it reads (a diff, a hook's output) cannot talk it into another command.
// Checking whole shapes, not looking for bad options, is the point: git and gh have too many
// ways to run a program (config, aliases, -c, abbreviated --receive-pack, ...) to list.
const SHIPPER = 'subagent-kit:shipper'

// Characters a word may hold outside single quotes: none of them means anything to bash.
const SAFE = /^[A-Za-z0-9_./:=,+@%-]$/
// A branch, rev or range (`main`, `origin/main..HEAD`); not `+force` or `:delete` refspecs.
const REF = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/

const DENY = (why: string) =>
  `subagent-kit: the shipper's Bash runs only these commands, one per call (${why}):\n` +
  '  git status [--short] [--branch] [--porcelain] [--untracked-files=all]\n' +
  '  git diff [--stat] [--name-only] [--name-status] [--cached] [--diff-filter=U] [<rev>] [-- <paths>]\n' +
  '  git log [--oneline] [-<n>] [--format=<f>] [<rev>, such as origin/main..HEAD]\n' +
  '  git branch --show-current\n' +
  '  git rev-parse [--abbrev-ref] [--short] [--show-toplevel] [<rev>]\n' +
  '  git add -- <paths>\n' +
  '  git commit -F <file>\n' +
  '  git push [-u origin <branch|HEAD>]\n' +
  '  gh pr create --title <t> --body-file <file> [--base <b>] [--head <b>] [--draft]\n' +
  '  gh pr edit [<n>] [--title <t>] [--body-file <file>] [--base <b>]\n' +
  '  gh pr view [<n>] [--json <fields>] [--jq <expr>]\n' +
  "Put paths with backslashes or spaces, and titles, in single quotes; write an apostrophe as \\'. " +
  'If you need anything else, stop and report.'

// Splits a command into its words the way bash would, or says why it can't: one simple
// command of plain words and single-quoted text, with nothing bash would expand or chain.
export const splitWords = (command: string): string[] | string => {
  const words: string[] = []
  let word: string | undefined
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      if (end < 0) return 'an unclosed quote'
      word = (word ?? '') + command.slice(i + 1, end)
      i = end
    } else if (c === '\\' && command[i + 1] === "'") {
      word = (word ?? '') + "'"
      i++
    } else if (c === ' ' || c === '\t') {
      if (word !== undefined) words.push(word)
      word = undefined
    } else if (SAFE.test(c)) {
      word = (word ?? '') + c
    } else {
      return c === '\n' ? 'one command per call' : `\`${c}\` outside single quotes`
    }
  }
  if (word !== undefined) words.push(word)
  return words
}

// What one subcommand accepts. Every word must fit: a flag, a flag with its value (the next
// word, or `--flag=value`), a word the pattern matches, or the next operand; after `--`, paths.
type Shape = {
  flags?: string[]
  values?: string[]
  required?: string[]
  pattern?: RegExp
  operands?: RegExp[]
  paths?: boolean
}

// A path names files below the working directory: no glob, `:` pathspec magic, `.` or `..`
// segment, trailing slash or absolute path, any of which can stage the whole tree.
const judgePath = (path: string) =>
  path === '' ||
  path.startsWith(':') ||
  /[*?[]/.test(path) ||
  /^([\\/]|[A-Za-z]:)/.test(path) ||
  /[\\/]$/.test(path) ||
  path.split(/[\\/]/).some(part => part === '.' || part === '..')
    ? `\`${path}\` is not a plain path`
    : undefined

// Why the words don't fit the shape, or undefined when they do.
const judgeShape = (shape: Shape, args: string[]): string | undefined => {
  const seen = new Set<string>()
  let operands = 0
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--' && shape.paths) {
      const paths = args.slice(i + 1)
      return paths.length ? paths.map(judgePath).find(Boolean) : 'no paths after `--`'
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const name = eq < 0 ? arg : arg.slice(0, eq)
    if (eq < 0 && shape.flags?.includes(arg)) continue
    if (shape.pattern?.test(arg)) continue
    if (shape.values?.includes(name)) {
      const value = eq < 0 ? args[++i] : arg.slice(eq + 1)
      if (!value || value.startsWith('-')) return `\`${name}\` needs a value`
      seen.add(name)
      continue
    }
    const operand = shape.operands?.[operands++]
    if (arg.startsWith('-') || !operand?.test(arg)) return `\`${arg}\` is not allowed here`
  }
  const missing = shape.required?.find(flag => !seen.has(flag))
  return missing && `\`${missing}\` is required`
}

const GIT: Record<string, Shape> = {
  status: {
    flags: ['--short', '-s', '--branch', '-b', '--porcelain'],
    pattern: /^--untracked-files=(all|normal|no)$/,
  },
  diff: {
    flags: ['--stat', '--name-only', '--name-status', '--cached', '--staged', '--no-color'],
    pattern: /^--diff-filter=[A-Za-z]+$/,
    operands: [REF],
    paths: true,
  },
  log: { flags: ['--oneline'], pattern: /^(-[0-9]+|--(format|pretty)=.*)$/s, operands: [REF] },
  branch: { flags: ['--show-current'] },
  'rev-parse': { flags: ['--abbrev-ref', '--short', '--show-toplevel'], operands: [REF] },
  add: { paths: true },
  commit: { values: ['-F'], required: ['-F'] },
  // Only to origin: a remote given as a path could be a planted repo whose hooks run.
  push: { flags: ['-u', '--set-upstream'], operands: [/^origin$/, REF] },
}

const GH_PR: Record<string, Shape> = {
  create: {
    flags: ['--draft'],
    values: ['--title', '--body-file', '--base', '--head'],
    required: ['--title', '--body-file'],
  },
  edit: { values: ['--title', '--body-file', '--base'], operands: [REF] },
  view: { values: ['--json', '--jq'], operands: [REF] },
}

// Why the shipper may not run this command, or undefined when it may.
export const judgeShipperCommand = (command: string): string | undefined => {
  const words = splitWords(command)
  if (typeof words === 'string') return words
  const [program, ...args] = words
  if (program === 'git') {
    const shape = Object.hasOwn(GIT, args[0] ?? '') ? GIT[args[0]] : undefined
    return shape ? judgeShape(shape, args.slice(1)) : `\`git ${args[0] ?? ''}\` is not one of them`
  }
  if (program === 'gh' && args[0] === 'pr') {
    const shape = Object.hasOwn(GH_PR, args[1] ?? '') ? GH_PR[args[1]] : undefined
    return shape ? judgeShape(shape, args.slice(2)) : `\`gh pr ${args[1] ?? ''}\` is not one of them`
  }
  return `\`${[program, args[0]].filter(Boolean).join(' ')}\` is not one of them`
}

// Whether the loop is a shipper's: one seen starting, or one the agent list names.
const isShipper = async ($: Engine, shippers: Set<string>, agentId: string | undefined) =>
  agentId !== undefined &&
  (shippers.has(agentId) || (await $.agent.list()).some(a => a.id === agentId && a.type === SHIPPER))

export const register: Register = on => {
  let rules: Promise<string> | undefined
  // Shippers seen starting: a workflow's agents are missing from `$.agent.list()`.
  const shippers = new Set<string>()

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!e.tools.includes('Agent')) return result
    rules ??= $.fs.read(`${$.plugin.root}/DELEGATION.md`) as Promise<string>
    return { sections: [...result.sections, { id: SECTION, text: await rules, scope: 'session' }] }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (e.subagentType === SHIPPER && result.agentId) shippers.add(result.agentId)
    return result
  })

  // A check that fails refuses the command rather than letting it through.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isShipper($, shippers, e.agentId))) return next(e)
    const why = judgeShipperCommand(e.command)
    return why === undefined ? next(e) : { deny: DENY(why) }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `subagent-kit: could not check the shipper's command (${next.error})` },
  )
}
