import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = 'C:/Users/me'
const SETTINGS = `${HOME}/.claude/settings.json`
const COPY = `${HOME}/.claude/statusline.sh`

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
}

test('install keeps other settings and points statusLine at the copied script', async ($, on) => {
  const files = new Map<string, string>()
  mock.env(on, { USERPROFILE: 'C:\\Users\\me' })
  fakeFs(on, files)
  files.set(
    SETTINGS,
    JSON.stringify({ theme: 'dark', statusLine: { type: 'command', command: 'old', refreshInterval: 30 } }),
  )

  const { text } = await $.command.run({ command: 'statusline-install' })

  expect(JSON.parse(files.get(SETTINGS) ?? '{}')).toEqual({
    theme: 'dark',
    statusLine: { type: 'command', command: 'bash ~/.claude/statusline.sh', refreshInterval: 30 },
  })
  expect(files.get(COPY)).toBe('echo status\n')
  expect(text).toContain('was `old`')

  const again = await $.command.run({ command: 'statusline-install' })
  expect(again.text).toContain('already points')
})

test('install creates settings.json when there is none', async ($, on) => {
  const files = new Map<string, string>()
  mock.env(on, { HOME })
  fakeFs(on, files)

  await $.command.run({ command: 'statusline-install' })

  expect(JSON.parse(files.get(SETTINGS) ?? '{}')).toEqual({
    statusLine: { type: 'command', command: 'bash ~/.claude/statusline.sh', refreshInterval: 60 },
  })
})
