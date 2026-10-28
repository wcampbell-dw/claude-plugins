import type { EngineInterface, Register } from 'claude-code'

// Refuses shell commands that fail on Windows for reasons the model can't see from the error:
// - Bash commands past about 7 KB arrive cut short, so bash reports an unmatched quote
//   somewhere in the middle. Big heredocs are the usual cause.
// - az is az.cmd, so cmd.exe re-parses its arguments and splits them at & and |, dropping
//   the rest of a URL, a JMESPath query or a KQL query without saying so. The shims in
//   ../shims run az's Python directly; once they are installed, only an explicit az.cmd
//   still goes through cmd.exe.
export const MAX_BASH = 6000

const AZ = /(?:^|[\s;&|(`{])(az(?:\.cmd)?)(?=\s|$)/m
const AZ_CMD = /(?:^|[\s;&|(`{'"])az\.cmd\b/im
const QUOTED_METACHAR = /'[^'\n]*[&|][^'\n]*'|"[^"\n]*[&|][^"\n]*"/

const TOO_LONG = (length: number) =>
  `shell-guard: this Bash command is ${length} characters. Bash commands over about 7 KB ` +
  `arrive cut short on this machine and fail with "unexpected EOF while looking for matching". ` +
  `Write file contents with the Write tool (temporary files go in the scratchpad), then run a ` +
  `short command that uses the file, such as \`gh issue create --body-file <file>\` or ` +
  `\`python -I <script>\`.`

const AZ_CMD_USED =
  `shell-guard: call \`az\`, not \`az.cmd\`. az.cmd goes through cmd.exe, which splits ` +
  `arguments at & and |. \`az\` runs a shim that calls the Azure CLI's Python directly, in ` +
  `both Bash and PowerShell.`

const AZ_METACHAR =
  `shell-guard: this az call has & or | inside a quoted argument. az is az.cmd here, and ` +
  `cmd.exe splits its arguments at those characters, so a URL loses its later parameters and ` +
  `a JMESPath or KQL query is cut. Pass URL parameters with \`az rest --uri-parameters\`, put ` +
  `a long query in a file and pass \`@<file>\` as the argument, or install the az shims from ` +
  `the shell-guard plugin's shims folder into a folder that comes before the Azure CLI on PATH.`

// RULES.md joins the system prompt of every prompt that offers a shell tool, the way a
// section of ~/.claude/CLAUDE.md would, so a machine needs only the plugin to get them.
const SECTION = 'shell-guard:rules'
const SHELLS = ['Bash', 'PowerShell']

// /shell-guard-install copies the shims to ~/.local/bin, and each session after copies them
// again when the plugin's differ, so updates reach them. /shell-guard-uninstall deletes them.
const SHIMS = ['az', 'az.ps1']
const INSTALLED = 'installed'

// Looked up once per load, and again after an install or uninstall.
let shim: Promise<boolean> | undefined

async function isWindows($: EngineInterface) {
  return (await $.env.get('OS')) === 'Windows_NT'
}

async function binDir($: EngineInterface) {
  const home = await $.env.get('USERPROFILE')
  if (home === undefined) throw new Error('USERPROFILE is not set')
  return `${home.replace(/[\\/]$/, '')}\\.local\\bin`
}

async function hasShim($: EngineInterface) {
  shim ??= binDir($)
    .then(bin => $.fs.exists(`${bin}\\az.ps1`))
    .catch(() => false)
  return shim
}

// Copies each shim whose copy differs from the plugin's; returns how many it wrote.
async function syncShims($: EngineInterface) {
  const bin = await binDir($)
  let written = 0
  for (const name of SHIMS) {
    const source = await $.fs.read(`${$.plugin.root}/shims/${name}`)
    const target = `${bin}\\${name}`
    const current = (await $.fs.exists(target)) ? await $.fs.read(target) : undefined
    if (current === source) continue
    await $.fs.write(target, source)
    written++
  }
  shim = undefined
  return written
}

// Where PATH puts ~/.local/bin against the Azure CLI's bin folder, as a line for the person.
async function pathAdvice($: EngineInterface) {
  const bin = (await binDir($)).toLowerCase()
  const dirs = ((await $.env.get('PATH')) ?? '')
    .split(';')
    .map(dir => dir.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase())
  const ours = dirs.indexOf(bin)
  const azure = dirs.findIndex(dir => /\\azure-cli\\bin$|\\cli2\\wbin$/.test(dir))
  if (ours === -1) {
    return `${bin} is not on PATH. Add it to your user PATH ahead of the Azure CLI, then restart Claude Code.`
  }
  if (azure !== -1 && azure < ours) {
    return `PATH has the Azure CLI's bin folder ahead of ${bin}, so \`az\` still runs az.cmd. Move ${bin} ahead of it in your user PATH, then restart Claude Code.`
  }
  return `${bin} comes before the Azure CLI on PATH, so \`az\` runs the shim.`
}

// Deletes the shims through PowerShell, since the plugin's file system can't delete.
async function removeShims($: EngineInterface) {
  const bin = await binDir($)
  const paths = SHIMS.map(name => `'${`${bin}\\${name}`.replace(/'/g, "''")}'`).join(',')
  const { exitCode, stderr } = await $.process.run([
    'powershell.exe',
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Remove-Item -LiteralPath ${paths} -Force -ErrorAction SilentlyContinue; exit 0`,
  ])
  shim = undefined
  if (exitCode !== 0) throw new Error(stderr.trim() || `powershell.exe exited ${exitCode}`)
}

async function judgeAz($: EngineInterface, command: string) {
  if (!AZ.test(command)) return undefined
  if (await hasShim($)) return AZ_CMD.test(command) ? AZ_CMD_USED : undefined
  return QUOTED_METACHAR.test(command) ? AZ_METACHAR : undefined
}

export const register: Register = on => {
  shim = undefined
  let rules: Promise<string> | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'shell-guard-install',
      description: 'Install the az shims in ~/.local/bin',
    })
    await $.command.register({
      name: 'shell-guard-uninstall',
      description: 'Remove the az shims from ~/.local/bin',
    })
    if ((await $.store.get(INSTALLED)) === true && (await isWindows($))) {
      await syncShims($).catch(err => $.ui.log(`could not update the az shims: ${err}`))
    }
    return next(e)
  })

  on('command.run', { command: 'shell-guard-install' }, async $ => {
    if (!(await isWindows($))) return { text: 'shell-guard only acts on Windows; nothing to install.' }
    const written = await syncShims($)
    await $.store.set(INSTALLED, true)
    const bin = await binDir($)
    return {
      text: [
        written === 0
          ? `The az shims in ${bin} are already current.`
          : `Copied the az shims (az, az.ps1) to ${bin}.`,
        await pathAdvice($),
        'Sessions keep the shims current until /shell-guard-uninstall.',
      ].join('\n'),
    }
  })

  on('command.run', { command: 'shell-guard-uninstall' }, async $ => {
    if (!(await isWindows($))) return { text: 'shell-guard only acts on Windows; nothing to remove.' }
    await removeShims($)
    await $.store.delete(INSTALLED)
    return { text: `Removed the az shims from ${await binDir($)}. \`az\` runs az.cmd again.` }
  })

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!e.tools.some(tool => SHELLS.includes(tool)) || !(await isWindows($))) return result
    rules ??= $.fs.read(`${$.plugin.root}/RULES.md`) as Promise<string>
    return { sections: [...result.sections, { id: SECTION, text: await rules, scope: 'session' }] }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!(await isWindows($))) return next(e)
    if (e.command.length > MAX_BASH) return { deny: TOO_LONG(e.command.length) }
    const deny = await judgeAz($, e.command)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'PowerShell' }, async ($, e, next) => {
    if (!(await isWindows($))) return next(e)
    const deny = await judgeAz($, e.command)
    return deny === undefined ? next(e) : { deny }
  }).catch(($, e, next) => next(e))
}
