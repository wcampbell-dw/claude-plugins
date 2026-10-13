import type { EngineInterface as Engine, Register } from 'claude-code'

// A plugin cannot set the statusLine setting itself, and its installed folder changes with
// each version. So each session copies the script to one fixed path, and
// /statusline-install points the statusLine setting at that path, once per machine.
const SCRIPT = '.claude/wc-statusline.sh'
const COMMAND = 'bash ~/.claude/wc-statusline.sh'

const homeDir = async ($: Engine): Promise<string> => {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  if (home === undefined) throw new Error('neither HOME nor USERPROFILE is set')
  return home.replace(/\\/g, '/').replace(/\/$/, '')
}

// Copies the plugin's script to ~/.claude/wc-statusline.sh when it differs.
const syncScript = async ($: Engine): Promise<boolean> => {
  const source = await $.fs.read(`${$.plugin.root}/scripts/statusline.sh`)
  const target = `${await homeDir($)}/${SCRIPT}`
  const current = (await $.fs.exists(target)) ? await $.fs.read(target) : undefined
  if (current === source) return false
  await $.fs.write(target, source)
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'statusline-install',
      description: 'Point the statusLine setting at the statusline script',
    })
    await syncScript($).catch(err => $.ui.log(`could not copy the status line script: ${err}`))

    return next(e)
  })

  on('command.run', { command: 'statusline-install' }, async $ => {
    await syncScript($)
    const path = `${await homeDir($)}/.claude/settings.json`
    const settings = (await $.fs.exists(path)) ? JSON.parse(await $.fs.read(path)) : {}
    const previous = settings.statusLine?.command

    settings.statusLine = {
      ...settings.statusLine,
      type: 'command',
      command: COMMAND,
      refreshInterval: settings.statusLine?.refreshInterval ?? 60,
    }
    await $.fs.write(path, `${JSON.stringify(settings, null, 2)}\n`)

    return {
      text:
        previous === COMMAND
          ? 'statusLine already points at the statusline script.'
          : `statusLine now runs \`${COMMAND}\`${previous ? ` (was \`${previous}\`)` : ''}.`,
    }
  })
}
