import type { EngineInterface as Engine, Register } from 'claude-code'

// A plugin cannot set the statusLine setting itself, and its installed folder changes with
// each version. So each session copies the script to one fixed path, and
// /statusline-install points the statusLine setting at that path, once per machine.
// /statusline-uninstall puts back what was there before, kept in the plugin's store.
const SCRIPT = '.claude/statusline.sh'
const COMMAND = 'bash ~/.claude/statusline.sh'

// Store keys. A backup set to null means there was nothing to keep.
const ORIGINAL_SCRIPT = 'originalScript'
const ORIGINAL_STATUS_LINE = 'originalStatusLine'
const UNINSTALLED = 'uninstalled'

type StatusLine = { command?: string; [key: string]: unknown }
type Settings = { statusLine?: StatusLine; [key: string]: unknown }

const homeDir = async ($: Engine): Promise<string> => {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  if (home === undefined) throw new Error('neither HOME nor USERPROFILE is set')
  return home.replace(/\\/g, '/').replace(/\/$/, '')
}

const settingsPath = async ($: Engine) => `${await homeDir($)}/.claude/settings.json`

const readSettings = async ($: Engine): Promise<Settings> => {
  const path = await settingsPath($)
  return (await $.fs.exists(path)) ? JSON.parse(await $.fs.read(path)) : {}
}

const writeSettings = async ($: Engine, settings: Settings) =>
  $.fs.write(await settingsPath($), `${JSON.stringify(settings, null, 2)}\n`)

// Copies the plugin's script to ~/.claude/statusline.sh when it differs. The first time it
// replaces a file that is not the plugin's, it keeps that file in the store.
const syncScript = async ($: Engine): Promise<boolean> => {
  const source = await $.fs.read(`${$.plugin.root}/scripts/statusline.sh`)
  const target = `${await homeDir($)}/${SCRIPT}`
  const current = (await $.fs.exists(target)) ? await $.fs.read(target) : undefined
  if (current === source) return false
  if ((await $.store.get(ORIGINAL_SCRIPT)) === undefined) {
    // When the setting already runs the copy, the file there is an older copy, not the user's.
    const isOurs = (await readSettings($)).statusLine?.command === COMMAND
    await $.store.set(ORIGINAL_SCRIPT, isOurs ? null : (current ?? null))
  }
  await $.fs.write(target, source)
  return true
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'statusline-install',
      description: 'Point the statusLine setting at the statusline script',
    })
    await $.command.register({
      name: 'statusline-uninstall',
      description: 'Restore the statusLine setting and script from before the install',
    })
    if ((await $.store.get(UNINSTALLED)) !== true) {
      await syncScript($).catch(err => $.ui.log(`could not copy the status line script: ${err}`))
    }

    return next(e)
  })

  on('command.run', { command: 'statusline-install' }, async $ => {
    await $.store.delete(UNINSTALLED)
    await syncScript($)
    const settings = await readSettings($)
    const previous = settings.statusLine?.command

    if (previous !== COMMAND && (await $.store.get(ORIGINAL_STATUS_LINE)) === undefined) {
      await $.store.set(ORIGINAL_STATUS_LINE, settings.statusLine ?? null)
    }
    settings.statusLine = {
      ...settings.statusLine,
      type: 'command',
      command: COMMAND,
      refreshInterval: settings.statusLine?.refreshInterval ?? 60,
    }
    await writeSettings($, settings)

    return {
      text:
        previous === COMMAND
          ? 'statusLine already points at the statusline script.'
          : `statusLine now runs \`${COMMAND}\`${previous ? ` (was \`${previous}\`)` : ''}.`,
    }
  })

  on('command.run', { command: 'statusline-uninstall' }, async $ => {
    const lines: string[] = []

    const settings = await readSettings($)
    const original = (await $.store.get(ORIGINAL_STATUS_LINE)) as StatusLine | null | undefined
    if (settings.statusLine?.command !== COMMAND) {
      lines.push('statusLine does not run the statusline script; left it as it is.')
    } else {
      if (original) settings.statusLine = original
      else delete settings.statusLine
      await writeSettings($, settings)
      lines.push(
        original?.command
          ? `statusLine runs \`${original.command}\` again.`
          : 'Removed the statusLine setting.',
      )
    }
    await $.store.delete(ORIGINAL_STATUS_LINE)

    const target = `${await homeDir($)}/${SCRIPT}`
    const script = await $.store.get(ORIGINAL_SCRIPT)
    if (typeof script === 'string') {
      await $.fs.write(target, script)
      lines.push(`Restored the original \`~/${SCRIPT}\`.`)
    } else {
      lines.push(`There was no \`~/${SCRIPT}\` before; the copy is left there and can be deleted.`)
    }
    // A later install backs up whatever is there then.
    await $.store.delete(ORIGINAL_SCRIPT)

    await $.store.set(UNINSTALLED, true)
    lines.push('Sessions no longer copy the script until /statusline-install runs again.')
    return { text: lines.join('\n') }
  })
}
