import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = 'C:/Users/me'
const SETTINGS = `${HOME}/.claude/settings.json`
const COPY = `${HOME}/.claude/statusline.sh`
const OURS = { type: 'command', command: 'bash ~/.claude/statusline.sh', refreshInterval: 30 }

// An in-memory file system beneath the plugin; the plugin's own script reads as 'echo status'.
const fakeFs = (on: On, files: Map<string, string>) => {
  const norm = (p: string) => p.replace(/\\/g, '/')
  const isOwnScript = (p: string) => norm(p).endsWith('/scripts/statusline.sh')
  on('fs.exists', ($, e) => ({ value: isOwnScript(e.path) || files.has(norm(e.path)) }))
  on('fs.read', ($, e) => {
    const text = isOwnScript(e.path) ? 'echo status\n' : files.get(norm(e.path))
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(norm(e.path), e.text)
    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
}

// A home at HOME with an empty plugin store; returns its files.
const setup = (on: On, store?: Record<string, unknown>) => {
  const files = new Map<string, string>()
  mock.env(on, { HOME })
  mock.store(on, store)
  fakeFs(on, files)
  return files
}

const settings = (files: Map<string, string>) => JSON.parse(files.get(SETTINGS) ?? '{}')

test('install keeps other settings and points statusLine at the copied script', async ($, on) => {
  const files = new Map<string, string>()
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  mock.store(on)
  fakeFs(on, files)
  files.set(
    SETTINGS,
    JSON.stringify({ theme: 'dark', statusLine: { type: 'command', command: 'old', refreshInterval: 30 } }),
  )

  const { text } = await $.command.run({ command: 'statusline-install' })

  expect(settings(files)).toEqual({
    theme: 'dark',
    statusLine: { type: 'command', command: 'bash ~/.claude/statusline.sh', refreshInterval: 30 },
  })
  expect(files.get(COPY)).toBe('echo status\n')
  expect(text).toContain('was `old`')

  const again = await $.command.run({ command: 'statusline-install' })
  expect(again.text).toContain('already points')
})

test('install creates settings.json when there is none', async ($, on) => {
  const files = setup(on)

  await $.command.run({ command: 'statusline-install' })

  expect(settings(files)).toEqual({
    statusLine: { type: 'command', command: 'bash ~/.claude/statusline.sh', refreshInterval: 60 },
  })
})

test('uninstall restores the setting and script from before the install', async ($, on) => {
  const files = setup(on)
  files.set(SETTINGS, JSON.stringify({ theme: 'dark', statusLine: { type: 'command', command: 'old', refreshInterval: 30 } }))
  files.set(COPY, 'echo mine\n')

  await $.session.start({ cwd: HOME, surface: null, isInteractive: false })
  expect(files.get(COPY)).toBe('echo status\n')
  await $.command.run({ command: 'statusline-install' })
  await $.command.run({ command: 'statusline-install' })

  const { text } = await $.command.run({ command: 'statusline-uninstall' })

  expect(settings(files)).toEqual({
    theme: 'dark',
    statusLine: { type: 'command', command: 'old', refreshInterval: 30 },
  })
  expect(files.get(COPY)).toBe('echo mine\n')
  expect(text).toContain('`old` again')

  // Sessions leave the restored script alone until the next install.
  await $.session.start({ cwd: HOME, surface: null, isInteractive: false })
  expect(files.get(COPY)).toBe('echo mine\n')
  await $.command.run({ command: 'statusline-install' })
  expect(files.get(COPY)).toBe('echo status\n')
})

test('uninstall removes the setting when there was none before', async ($, on) => {
  const files = setup(on)
  files.set(SETTINGS, JSON.stringify({ theme: 'dark' }))

  await $.command.run({ command: 'statusline-install' })
  const { text } = await $.command.run({ command: 'statusline-uninstall' })

  expect(settings(files)).toEqual({ theme: 'dark' })
  expect(files.get(COPY)).toBe('echo status\n')
  expect(text).toContain('no `~/.claude/statusline.sh` before')
})

test('an install from before backups existed does not keep the old copy as the original', async ($, on) => {
  const files = setup(on)
  files.set(SETTINGS, JSON.stringify({ statusLine: OURS }))
  files.set(COPY, 'echo older version\n')

  await $.session.start({ cwd: HOME, surface: null, isInteractive: false })
  await $.command.run({ command: 'statusline-uninstall' })

  expect(settings(files)).toEqual({})
  expect(files.get(COPY)).toBe('echo status\n')
})

test('uninstall leaves a statusLine the user changed since', async ($, on) => {
  const files = setup(on, { originalStatusLine: null })
  files.set(SETTINGS, JSON.stringify({ statusLine: { type: 'command', command: 'theirs' } }))

  const { text } = await $.command.run({ command: 'statusline-uninstall' })

  expect(settings(files)).toEqual({ statusLine: { type: 'command', command: 'theirs' } })
  expect(text).toContain('left it as it is')
})
