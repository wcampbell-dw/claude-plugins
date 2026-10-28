import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SHIM = 'C:\\Users\\me\\.local\\bin\\az.ps1'

const setup = (on: On, { windows = true, shim = false } = {}) => {
  mock.env(on, windows ? { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' } : {})
  on('fs.exists', ($, e) => ({ value: shim && e.path === SHIM }))
  on('tool.call', () => ({ result: { stdout: 'ran', stderr: '', interrupted: false }, text: 'ran' }))
}

const run = ($: Parameters<Parameters<typeof test>[1]>[0], tool: 'Bash' | 'PowerShell', command: string) =>
  $.tool.call({ tool, command, description: 'test' })

test('refuses a Bash command over the limit and says to use the Write tool', async ($, on) => {
  setup(on)

  const result = await run($, 'Bash', `cat > f.md <<'EOF'\n${'x'.repeat(6100)}\nEOF`)

  expect(result.deny).toContain('Write tool')
})

test('runs a Bash command under the limit', async ($, on) => {
  setup(on)

  const result = await run($, 'Bash', `cat > f.md <<'EOF'\n${'x'.repeat(5000)}\nEOF`)

  expect(result.text).toBe('ran')
})

test('leaves PowerShell commands of any length alone', async ($, on) => {
  setup(on)

  const result = await run($, 'PowerShell', `"${'x'.repeat(9000)}"`)

  expect(result.text).toBe('ran')
})

test('does nothing off Windows', async ($, on) => {
  setup(on, { windows: false })

  const big = await run($, 'Bash', 'x'.repeat(9000))
  const az = await run($, 'Bash', `az rest --url 'https://h/x?a=1&b=2'`)

  expect(big.text).toBe('ran')
  expect(az.text).toBe('ran')
})

for (const tool of ['Bash', 'PowerShell'] as const) {
  test(`${tool}: without the shim, refuses az with & in a quoted URL`, async ($, on) => {
    setup(on)

    const result = await run($, tool, `az rest --method get --url 'https://h/x?api-version=1&$top=3'`)

    expect(result.deny).toContain('--uri-parameters')
  })

  test(`${tool}: without the shim, refuses az.cmd with | in a quoted query`, async ($, on) => {
    setup(on)

    const result = await run($, tool, `az.cmd webapp show -g rg -n app --query "hosts[?contains(@,'scm')]|[0]"`)

    expect(result.deny).toContain('shell-guard')
  })

  test(`${tool}: without the shim, runs az with no & or | in quotes`, async ($, on) => {
    setup(on)

    const result = await run($, tool, `az account show --query id -o tsv | head -1`)

    expect(result.text).toBe('ran')
  })

  test(`${tool}: with the shim, refuses az.cmd`, async ($, on) => {
    setup(on, { shim: true })

    const result = await run($, tool, `$sub = az.cmd account show --query id -o tsv`)

    expect(result.deny).toContain('not `az.cmd`')
  })

  test(`${tool}: with the shim, runs az with & in a quoted URL`, async ($, on) => {
    setup(on, { shim: true })

    const result = await run($, tool, `az rest --method get --url 'https://h/x?api-version=1&$top=3'`)

    expect(result.text).toBe('ran')
  })

  test(`${tool}: ignores & and | in commands that don't call az`, async ($, on) => {
    setup(on)

    const result = await run($, tool, `gh issue view 1 --json title -q '.title | ascii_downcase'; echo "a&b"`)

    expect(result.text).toBe('ran')
  })
}

test('does not mistake a word ending in az for the az command', async ($, on) => {
  setup(on)

  const result = await run($, 'Bash', `echo "jazz & blues"; ls /c/baz`)

  expect(result.text).toBe('ran')
})
