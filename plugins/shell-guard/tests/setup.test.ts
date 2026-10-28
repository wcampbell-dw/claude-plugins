import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = 'C:\\Users\\me'
const BIN = `${HOME}\\.local\\bin`
const AZURE = 'C:\\Users\\me\\AppData\\Local\\azure-cli\\bin\\'
const BASE = { id: 'intro', text: 'You are Claude Code.', scope: 'shared' } as const

// An in-memory file system beneath the plugin. The plugin's own files read as
// 'shim:<name>' and '# Windows shells\n'.
const fakeFs = (on: On, files: Map<string, string>) => {
  const own = (p: string) => {
    const m = p.replace(/\\/g, '/').match(/\/(shims\/[^/]+|RULES\.md)$/)
    if (!m) return undefined
    return m[1] === 'RULES.md' ? '# Windows shells\n' : `shim:${m[1].slice(6)}`
  }
  on('fs.exists', ($, e) => ({ value: own(e.path) !== undefined || files.has(e.path) }))
  on('fs.read', ($, e) => {
    const text = own(e.path) ?? files.get(e.path)
    return text === undefined ? { deny: `ENOENT ${e.path}` } : { value: text }
  })
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
}

const setup = (
  on: On,
  { windows = true, path = `${BIN};${AZURE}`, store }: { windows?: boolean; path?: string; store?: Record<string, unknown> } = {},
) => {
  const files = new Map<string, string>()
  const ran: string[][] = []
  mock.env(on, windows ? { OS: 'Windows_NT', USERPROFILE: HOME, PATH: path } : {})
  mock.store(on, store)
  fakeFs(on, files)
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('process.run', ($, e) => {
    ran.push([...e.argv])
    for (const name of ['az', 'az.ps1']) files.delete(`${BIN}\\${name}`)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('prompt.compose', () => ({ sections: [BASE] }))
  return { files, ran }
}

const compose = (tools: string[]) => ({
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: [],
  tools,
  outputStyle: null,
  traits: [],
})

test('install copies both shims to ~/.local/bin and confirms the PATH order', async ($, on) => {
  const { files } = setup(on)

  const { text } = await $.command.run({ command: 'shell-guard-install', args: '' })

  expect(files.get(`${BIN}\\az`)).toBe('shim:az')
  expect(files.get(`${BIN}\\az.ps1`)).toBe('shim:az.ps1')
  expect(text).toContain('Copied the az shims')
  expect(text).toContain('comes before the Azure CLI')

  // Installed: the next session start replaces a copy that went stale.
  files.set(`${BIN}\\az`, 'old')
  await $.session.start({ cwd: 'C:\\work', source: 'startup' })
  expect(files.get(`${BIN}\\az`)).toBe('shim:az')
})

test('install says when the shims are already current', async ($, on) => {
  const { files } = setup(on)
  files.set(`${BIN}\\az`, 'shim:az')
  files.set(`${BIN}\\az.ps1`, 'shim:az.ps1')

  const { text } = await $.command.run({ command: 'shell-guard-install', args: '' })

  expect(text).toContain('already current')
})

test('install warns when ~/.local/bin is missing from PATH', async ($, on) => {
  setup(on, { path: AZURE })

  const { text } = await $.command.run({ command: 'shell-guard-install', args: '' })

  expect(text).toContain('is not on PATH')
})

test('install warns when the Azure CLI comes first on PATH', async ($, on) => {
  setup(on, { path: `${AZURE};${BIN}` })

  const { text } = await $.command.run({ command: 'shell-guard-install', args: '' })

  expect(text).toContain('still runs az.cmd')
})

test('install does nothing off Windows', async ($, on) => {
  const { files } = setup(on, { windows: false })

  const { text } = await $.command.run({ command: 'shell-guard-install', args: '' })

  expect(text).toContain('only acts on Windows')
  expect(files.size).toBe(0)
})

test('once installed, a session start replaces an outdated shim', async ($, on) => {
  const { files } = setup(on, { store: { installed: true } })
  files.set(`${BIN}\\az`, 'old')

  await $.session.start({ cwd: 'C:\\work', source: 'startup' })

  expect(files.get(`${BIN}\\az`)).toBe('shim:az')
  expect(files.get(`${BIN}\\az.ps1`)).toBe('shim:az.ps1')
})

test('before an install, a session start copies nothing', async ($, on) => {
  const { files } = setup(on)

  await $.session.start({ cwd: 'C:\\work', source: 'startup' })

  expect(files.size).toBe(0)
})

test('uninstall deletes the shims and stops the session copies', async ($, on) => {
  const { files, ran } = setup(on, { store: { installed: true } })
  files.set(`${BIN}\\az`, 'shim:az')
  files.set(`${BIN}\\az.ps1`, 'shim:az.ps1')

  const { text } = await $.command.run({ command: 'shell-guard-uninstall', args: '' })

  expect(ran[0][0]).toBe('powershell.exe')
  expect(ran[0].at(-1)).toContain(`'${BIN}\\az','${BIN}\\az.ps1'`)
  expect(files.size).toBe(0)
  expect(text).toContain('Removed the az shims')

  // Uninstalled: the next session start copies nothing back.
  await $.session.start({ cwd: 'C:\\work', source: 'startup' })
  expect(files.size).toBe(0)
})

test('adds the rules to a prompt that offers a shell tool', async ($, on) => {
  setup(on)

  const { sections } = await $.prompt.compose(compose(['Read', 'PowerShell']))

  expect(sections).toEqual([
    BASE,
    { id: 'shell-guard:rules', text: '# Windows shells\n', scope: 'session' },
  ])
})

test('leaves a prompt without a shell tool alone', async ($, on) => {
  setup(on)

  const { sections } = await $.prompt.compose(compose(['Read', 'Edit']))

  expect(sections).toEqual([BASE])
})

test('leaves the prompt alone off Windows', async ($, on) => {
  setup(on, { windows: false })

  const { sections } = await $.prompt.compose(compose(['Bash']))

  expect(sections).toEqual([BASE])
})
