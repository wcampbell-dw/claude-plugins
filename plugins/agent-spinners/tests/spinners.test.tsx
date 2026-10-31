import type { AgentInfo, On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const BAND = {
  plugin: 'agent-spinners',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('running agents spin, then tick and drop off', async ($, on) => {
  const clock = mock.clock(on)
  let agents: AgentInfo[] = []

  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })

  agents = [{ id: 'a1', description: 'Scope the repo', type: 'scoper', status: 'running' }]
  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'go',
    description: 'Scope the repo',
    subagentType: 'scoper',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ in: 'agent-spinners', text: /Scope the repo/ }))).toBeDefined()
  expect((await ui.find({ in: 'agent-spinners', text: '⠋ ' }))).toBeDefined()

  // The type leads, with its one space and no padding.
  expect(await ui.find({ in: 'agent-spinners', type: 'Text', text: 'scoper ' })).toBeDefined()

  await ui.advance(80)
  expect((await ui.find({ in: 'agent-spinners', text: '⠙ ' }))).toBeDefined()

  const label = async () => (await ui.find({ in: 'agent-spinners', type: 'Text', text: /Scope the repo/ }))?.props.dimColor
  expect(await label()).toBeFalsy()

  // Nothing changes for 5s: the row dims, not before.
  await clock.advance(4500)
  expect(await label()).toBeFalsy()
  await clock.advance(1000)
  expect(await label()).toBe(true)

  // A change brightens it again.
  agents = [{ ...agents[0]!, status: 'waiting' }]
  await clock.advance(500)
  expect(await label()).toBeFalsy()

  agents = [{ ...agents[0]!, status: 'completed' }]
  await clock.advance(500)
  expect((await ui.find({ in: 'agent-spinners', text: 'finished' }))).toBeDefined()

  // A finished row outlasts the quiet time, still up and still bright at 6s.
  await clock.advance(6000)
  expect((await ui.find({ in: 'agent-spinners', text: 'finished' }))?.props.dimColor).toBeFalsy()
  expect(await label()).toBeFalsy()

  await clock.advance(3000)
  expect(await ui.find({ key: 'engine' })).toBeDefined()
  await ui.unmount()
})

test('a plugin agent shows by its own name', async ($, on) => {
  const clock = mock.clock(on)
  const names: [string, string][] = [
    ['general-purpose', 'general-purpose'],
    ['mattpocock-skills:research', 'research'],
    ['subagent-kit:implementer', 'implementer'],
    ['subagent-kit:sc', 'sc'],
    ['pluginname:research-x', 'research-x'],
    ['lab:an-extremely-long-agent', 'an-extremely-long-agent'],
    ['an-extremely-long-builtin', 'an-extremely-long-builtin'],
  ]
  const agents: AgentInfo[] = names.map(([type], i) => ({
    id: `a${i}`,
    description: `agent ${i}`,
    type,
    status: 'running',
  }))

  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a0' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'go',
    description: 'agent 0',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const drawn = (await ui.findAll({ in: 'agent-spinners', type: 'Text' })).map(t => t.text)

  for (const [, shown] of names) {
    expect(drawn).toContain(`${shown} `)
  }
  await ui.unmount()
})

test('an idle agent holds its last frame in gray', async ($, on) => {
  const clock = mock.clock(on)
  let agents: AgentInfo[] = [{ id: 'a1', description: 'Teammate', type: 'teammate', status: 'running' }]

  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'go',
    description: 'Teammate',
    subagentType: 'teammate',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const mark = async () => (await ui.findAll({ in: 'agent-spinners', type: 'Text' }))[0]

  // Spin to the fourth frame, then go idle.
  await ui.advance(240)
  expect((await mark())?.text).toBe('⠸ ')

  agents = [{ ...agents[0]!, status: 'idle' }]
  await clock.advance(500)
  await ui.advance(400)
  expect((await mark())?.text).toBe('⠸ ')
  expect((await mark())?.props.color).toBe('inactive')

  // Back to running, it spins on from the live frame in magenta.
  agents = [{ ...agents[0]!, status: 'running' }]
  await clock.advance(500)
  await ui.advance(80)
  expect((await mark())?.props.color).toBe('merged')
  expect((await mark())?.text).not.toBe('⠸ ')
  await ui.unmount()
})

test("a spinning row's type glints, and a still one's doesn't", async ($, on) => {
  const clock = mock.clock(on)
  let agents: AgentInfo[] = [{ id: 'a1', description: 'Scope', type: 'scoper', status: 'running' }]
  setup(on, () => agents)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('ui.toast', () => ({ value: undefined }))
  const COLORS: Record<string, string> = { running: 'merged', waiting: 'warning', idle: 'inactive' }
  await spawn($, 'Scope')
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // The type's runs, each marked `*` when lit.
  const type = async () =>
    (await ui.findAll({ in: 'agent-spinners', type: 'Text' }))
      .slice(1, -1)
      .map(t => {
        expect(t.props.color).toBe(COLORS[agents[0]!.status])
        return t.props.bold ? `*${t.text}*` : t.text
      })

  // Whole and in full color at first, then lit three graphemes at a time, one step per
  // frame from the right, the space after the name included.
  expect(await type()).toEqual(['scoper '])
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: 'scoper ' }))?.props.dimColor).toBeFalsy()
  await ui.advance(80)
  expect(await type()).toEqual(['scoper', '* *'])
  await ui.advance(160)
  expect(await type()).toEqual(['scop', '*er *'])
  await ui.advance(80)
  expect(await type()).toEqual(['sco', '*per*', ' '])
  await ui.advance(320)
  expect(await type()).toEqual(['*sc*', 'oper '])

  // It rests off the word, then sweeps again: 7 graphemes and 10 steps of rest.
  await ui.advance(160)
  expect(await type()).toEqual(['scoper '])
  await ui.advance(80 * 10)
  expect(await type()).toEqual(['scoper', '* *'])

  // Waiting, it steps at a third of the pace, like its spinner.
  agents = [{ ...agents[0]!, status: 'waiting' }]
  await clock.advance(500)
  const seen: string[] = []
  for (let i = 0; i < 9; i++) {
    await ui.advance(80)
    seen.push((await type()).join('|'))
  }
  expect(seen.filter((runs, i) => i > 0 && runs !== seen[i - 1])).toHaveLength(2)

  // Idle, it's whole, gray and unlit.
  agents = [{ ...agents[0]!, status: 'idle' }]
  await clock.advance(500)
  for (let i = 0; i < 5; i++) {
    await ui.advance(80)
    expect(await type()).toEqual(['scoper '])
  }
  await ui.unmount()
})

test('a toast says when agents finish or need attention', async ($, on) => {
  const clock = mock.clock(on)
  const toasts: { text: string; timeoutMs?: number }[] = []
  let agents: AgentInfo[] = [
    { id: 'a1', description: 'Scope the repo', type: 'scoper', status: 'running' },
    { id: 'a2', description: 'Fix the test', type: 'implementer', status: 'running' },
    { id: 'a3', description: 'Ship it', type: 'shipper', status: 'running' },
  ]

  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('ui.toast', ($, e) => {
    toasts.push(e)

    return { value: undefined }
  })

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'go',
    description: 'Scope the repo',
    subagentType: 'scoper',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await clock.advance(0)
  expect(toasts).toHaveLength(0)

  // One waits on a permission prompt: a long toast.
  agents = [agents[0]!, { ...agents[1]!, status: 'waiting' }, agents[2]!]
  await clock.advance(500)
  expect(toasts).toEqual([{ text: '⏳ implementer needs attention: Fix the test', timeoutMs: 12000 }])

  // Two end in the same check: a toast each.
  agents = [{ ...agents[0]!, status: 'completed' }, agents[1]!, { ...agents[2]!, status: 'killed' }]
  await clock.advance(500)
  expect(toasts.slice(1)).toEqual([
    { text: '✓ scoper finished: Scope the repo', timeoutMs: 6000 },
    { text: '✗ shipper was stopped: Ship it', timeoutMs: 6000 },
  ])

  // Back to running says nothing; failing does.
  agents = [agents[0]!, { ...agents[1]!, status: 'running' }, agents[2]!]
  await clock.advance(500)
  expect(toasts).toHaveLength(3)
  agents = [agents[0]!, { ...agents[1]!, status: 'failed' }, agents[2]!]
  await clock.advance(500)
  expect(toasts[3]?.text).toBe('✗ implementer failed: Fix the test')
})

test("a row shows the agent's latest tool call beside its title", async ($, on) => {
  const clock = mock.clock(on)
  let agents: AgentInfo[] = [{ id: 'a1', description: 'Scope the repo', type: 'scoper', status: 'running' }]

  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'go',
    description: 'Scope the repo',
    subagentType: 'scoper',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // The row past the spinner and the type.
  const row = async () =>
    (await ui.findAll({ in: 'agent-spinners', type: 'Text' }))
      .slice(2)
      .map(t => t.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim()

  // Nothing called yet: the title alone, unpadded.
  expect(await row()).toBe('Scope the repo')
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: /Scope the repo/ }))?.text).toBe('Scope the repo')

  // Bash goes by its description, a file by its name, an MCP tool by its own name.
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests', agentId: 'a1' })
  await clock.advance(0)
  expect(await row()).toBe('Scope the repo › Bash: Run the tests')

  await $.tool.call({ tool: 'Read', file_path: 'C:\\repo\\hooks\\register.tsx', agentId: 'a1' })
  await clock.advance(0)
  expect(await row()).toBe('Scope the repo › Read: register.tsx')

  await $.tool.call({ tool: 'mcp__docs__lookup', agentId: 'a1' })
  await clock.advance(0)
  expect(await row()).toBe('Scope the repo › lookup')

  // A main-loop call names no agent and changes no row.
  await $.tool.call({ tool: 'Glob', pattern: '**/*.ts' })
  await clock.advance(0)
  expect(await row()).toBe('Scope the repo › lookup')

  // An agent that has ended says so in the status column, in place of its
  // last call, its spinner stopped in gray.
  agents = [{ ...agents[0]!, status: 'completed' }]
  await clock.advance(500)
  expect(await row()).toBe('Scope the repo › finished')
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: 'finished' }))?.props.color).toBe('success')
  expect((await ui.findAll({ in: 'agent-spinners', type: 'Text' }))[0]?.props.color).toBe('inactive')

  agents = [{ ...agents[0]!, status: 'killed' }]
  await clock.advance(500)
  expect(await row()).toBe('Scope the repo › stopped')
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: 'stopped' }))?.props.color).toBe('error')
  await ui.unmount()
})

test('a narrow band cuts the row once at its edge, the status first, then the title, then the type', async ($, on) => {
  const clock = mock.clock(on)
  const agents: AgentInfo[] = [
    { id: 'a1', description: 'Scope the repo for the login bug', type: 'general-purpose', status: 'running' },
  ]

  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'go',
    description: 'Scope the repo for the login bug',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests', agentId: 'a1' })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // The row after its spinner, as one line: the type's glint splits it into
  // runs.
  const at = async (columns: number) => {
    await ui.resize({ columns, rows: 3, in: 'agent-spinners' })
    await ui.advance(80)
    return (await drawn(ui)).slice(1).join('')
  }

  // Wide: the whole row, packed with no padding.
  expect(await at(100)).toBe('general-purpose Scope the repo for the login bug › Bash: Run the tests')

  // The status goes first, cut to the room left.
  expect(await at(61)).toBe('general-purpose Scope the repo for the login bug › Bash: R…')

  // The cut drops the space it would leave before the `…`.
  expect(await at(60)).toBe('general-purpose Scope the repo for the login bug › Bash:…')

  // Cut in the separator, the line ends cleanly after the title.
  for (const columns of [52, 53, 54]) {
    expect(await at(columns)).toBe('general-purpose Scope the repo for the login bug…')
  }
  expect(await at(55)).toBe('general-purpose Scope the repo for the login bug › B…')

  // Then the title, with no separator drawn.
  expect(await at(30)).toBe('general-purpose Scope the r…')

  // Then the type.
  expect(await at(10)).toBe('general…')
  await ui.unmount()
})

test('a status longer than the room left is cut at the band edge, the title kept', async ($, on) => {
  const clock = mock.clock(on)
  const agents: AgentInfo[] = [{ id: 'a1', description: 'Push branch and open PR', type: 'shipper', status: 'running' }]

  on('agent.list', () => ({ value: agents }))
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', () => ({ result: {} }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })

  await $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'go',
    description: 'Push branch and open PR',
    subagentType: 'shipper',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })
  await $.tool.call({
    tool: 'Bash',
    command: 'gh pr create',
    description: 'Write PR body file and open the pull request against main',
    agentId: 'a1',
  })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.resize({ columns: 70, rows: 3, in: 'agent-spinners' })
  await ui.advance(80)
  const texts = await drawn(ui)

  expect(texts[0]).toMatch(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] $/)
  // The cut drops the space it would leave before the `…`.
  expect(texts.slice(1).join('')).toBe('shipper Push branch and open PR › Bash: Write PR body file and open…')
  expect(texts.join('')).toHaveLength(70)
  await ui.unmount()
})

test('wide characters count two cells and a cut never splits one', async ($, on) => {
  const clock = mock.clock(on)
  const agents: AgentInfo[] = [
    { id: 'a1', description: '日本語のタイトル', type: 'scoper', status: 'running' },
    { id: 'a2', description: 'ab👍🏽cd', type: 'scoper', status: 'running' },
  ]
  setup(on, () => agents)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  await spawn($, '日本語のタイトル')
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const at = async (columns: number) => {
    await ui.resize({ columns, rows: 3, in: 'agent-spinners' })
    await ui.advance(80)
    return drawn(ui)
  }
  const cjk = (texts: string[]) => texts.find(t => t.startsWith('日'))

  // Whole at 25 cells: 2 + 7 + 8 CJK characters of 2 cells each.
  expect(cjk(await at(25))).toBe('日本語のタイトル')

  // Five characters make 10 cells; the `…` is the 20th.
  expect(cjk(await at(20))).toBe('日本語のタ…')

  // A sixth wouldn't fit in the 9 cells left, so the cut stops before it.
  expect(cjk(await at(19))).toBe('日本語の…')

  // 3 cells of room: one CJK character fits; the emoji with its skin tone is
  // one grapheme of 2 cells, so 'ab' stops before it.
  const narrow = await at(13)
  expect(cjk(narrow)).toBe('日…')
  expect(narrow.find(t => t.startsWith('ab'))).toBe('ab…')
  await ui.unmount()
})

const BASH_BG = { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }

const notify = (blocks: string[]) => blocks.map(block => `<task-notification>\n${block}\n</task-notification>`).join('\n')


// The shared mocks: the agents listed, a band the engine draws, and the prompt
// chain answered at the bottom.
function setup(on: On, agents: () => AgentInfo[]) {
  on('agent.list', () => ({ value: agents() }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })
}

const submit = ($: Engine, text: string, kind: 'task-notification' | 'composer' = 'task-notification') =>
  $.prompt.submit({ text, wait: false, origin: { kind } as never })

const spawn = ($: Engine, description: string) =>
  $.agent.spawn({
    tool_use_id: 't1',
    prompt: 'go',
    description,
    subagentType: 'implementer',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
  })

const drawn = async (ui: { findAll: (q: object) => Promise<{ text: string }[]> }) =>
  (await ui.findAll({ in: 'agent-spinners', type: 'Text' })).map(t => t.text)

test('a background command gets a top-level shell row until its notification', async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  on('tool.call', { tool: 'Bash' }, () => ({ result: BASH_BG }))

  await $.tool.call({ tool: 'Bash', command: 'npm  test', description: 'Run the   login tests', run_in_background: true })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = async () => (await drawn(ui)).join('')
  expect(await text()).toContain('shell ')
  expect(await text()).toContain('Run the login tests')
  expect(await text()).not.toContain('└')
  expect((await ui.findAll({ in: 'agent-spinners', type: 'Text' }))[0]?.props.color).toBe('planMode')

  // An id that isn't tracked changes nothing.
  await submit($, notify(['<task-id>zzz</task-id>\n<status>failed</status>']))
  await clock.advance(500)
  expect(await text()).not.toContain('failed')

  await submit(
    $,
    notify(['<task-id>b1</task-id>\n<output-file>x</output-file>\n<status>completed</status>\n<summary>done</summary>']),
  )
  await clock.advance(500)
  expect(await text()).toContain('finished')
  expect((await ui.findAll({ in: 'agent-spinners', type: 'Text' }))[0]?.props.color).toBe('inactive')

  // Up for 8s after it ended, then gone.
  await clock.advance(7000)
  expect(await text()).toContain('finished')
  await clock.advance(1500)
  expect(await ui.find({ key: 'engine' })).toBeDefined()
  await ui.unmount()
})

test('a background PowerShell command gets a shell row too', async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  on('tool.call', { tool: 'PowerShell' }, () => ({ result: { ...BASH_BG, backgroundTaskId: 'p1' } }))

  await $.tool.call({ tool: 'PowerShell', command: 'Start-Sleep 30', description: 'Wait on the build', run_in_background: true })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = async () => (await drawn(ui)).join('')
  expect(await text()).toContain('shell ')
  expect(await text()).toContain('Wait on the build')

  await submit($, notify(['<task-id>p1</task-id>\n<status>completed</status>']))
  await clock.advance(500)
  expect(await text()).toContain('finished')
  await ui.unmount()
})

test('a monitor an agent started sits under that agent', async ($, on) => {
  const clock = mock.clock(on)
  const agents: AgentInfo[] = [
    { id: 'a1', description: 'Fix the test', type: 'implementer', status: 'running' },
    { id: 'a2', description: 'Other agent', type: 'scoper', status: 'running' },
  ]
  setup(on, () => agents)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'm1', timeoutMs: 0, persistent: true } }))
  await spawn($, 'Fix the test')

  await $.tool.call({
    tool: 'Monitor',
    command: 'tail -f log',
    description: 'errors in deploy.log',
    timeout_ms: 0,
    agentId: 'a1',
  })
  await clock.advance(0)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = await drawn(ui)

  // The agent, its child, then the other agent.
  const at = (re: RegExp) => texts.findIndex(t => re.test(t))
  expect(at(/Fix the test/)).toBeLessThan(at(/errors in deploy\.log/))
  expect(at(/errors in deploy\.log/)).toBeLessThan(at(/Other agent/))
  expect(texts).toContain('  └  ')
  expect(texts).toContain('monitor ')
  await ui.unmount()
})

test('a monitor event shows as activity and a TaskStop shows stopped', async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'm1', timeoutMs: 0, persistent: true } }))
  on('tool.call', { tool: 'TaskStop' }, () => ({ result: { message: 'stopped', task_id: 'm1', task_type: 'monitor' } }))

  await $.tool.call({ tool: 'Monitor', command: 'tail -f log', description: 'errors in deploy.log', timeout_ms: 0 })
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const text = async () => (await drawn(ui)).join('')

  await clock.advance(6000)
  const label = async () =>
    (await ui.find({ in: 'agent-spinners', type: 'Text', text: /errors in deploy/ }))?.props.dimColor
  expect(await label()).toBe(true)

  await submit(
    $,
    '<task-notification>\n<task-id>m1</task-id>\n<summary>Monitor event: "x"</summary>\n<event>  ERROR:   timeout\nafter 30s </event>\nIf this event is something...\n</task-notification>',
  )
  await clock.advance(500)
  expect(await text()).toContain('ERROR: timeout')
  expect(await text()).not.toContain('after 30s')
  expect(await label()).toBeFalsy()

  await $.tool.call({ tool: 'TaskStop', task_id: 'm1' })
  await clock.advance(500)
  expect(await text()).toContain('stopped')
  expect(await text()).not.toContain('ERROR')
  await ui.unmount()
})

test('one prompt text carrying two notifications updates both tasks', async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  let n = 0
  on('tool.call', { tool: 'Bash' }, () => ({ result: { ...BASH_BG, backgroundTaskId: `b${++n}` } }))

  await $.tool.call({ tool: 'Bash', command: 'one', description: 'First job', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'two', description: 'Second job', run_in_background: true })
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await submit(
    $,
    notify(['<task-id>b1</task-id>\n<status>completed</status>', '<task-id>b2</task-id>\n<status>failed</status>']),
  )
  await clock.advance(500)
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: 'finished' }))?.props.color).toBe('success')
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: 'failed' }))?.props.color).toBe('error')
  await ui.unmount()
})

test('a task that ends with its agent is stopped when the agent completes', async ($, on) => {
  const clock = mock.clock(on)
  let agents: AgentInfo[] = [{ id: 'a1', description: 'Fix the test', type: 'implementer', status: 'running' }]
  setup(on, () => agents)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { ...BASH_BG, backgroundEndsWithFinalResponse: true } }))
  await spawn($, 'Fix the test')

  await $.tool.call({
    tool: 'Bash',
    command: 'sleep 99',
    description: 'Wait around',
    run_in_background: true,
    agentId: 'a1',
  })
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(1000)
  expect((await drawn(ui)).join('')).not.toContain('stopped')

  agents = [{ ...agents[0]!, status: 'completed' }]
  await clock.advance(500)
  const stopped = await ui.findAll({ in: 'agent-spinners', type: 'Text', text: 'stopped' })
  expect(stopped).toHaveLength(1)
  expect(stopped[0]?.props.color).toBe('error')
  await ui.unmount()
})

test('a monitor still running past its timeout is taken to have ended', async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  on('tool.call', { tool: 'Monitor' }, () => ({ result: { taskId: 'm1', timeoutMs: 10000 } }))

  await $.tool.call({ tool: 'Monitor', command: 'tail -f log', description: 'Watch the log', timeout_ms: 10000 })
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await clock.advance(14000)
  expect((await drawn(ui)).join('')).not.toContain('finished')
  await clock.advance(1500)
  expect((await drawn(ui)).join('')).toContain('finished')
  await ui.unmount()
})

test('a stop ends the tasks it no longer lists as in flight', async ($, on) => {
  const clock = mock.clock(on)
  const agents: AgentInfo[] = [{ id: 'a1', description: 'Fix the test', type: 'implementer', status: 'running' }]
  setup(on, () => agents)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  let next = 0
  on('tool.call', { tool: 'Bash' }, () => ({ result: { ...BASH_BG, backgroundTaskId: `b${++next}` } }))
  on('classic.Stop', () => ({}))
  on('classic.SubagentStop', () => ({}))
  await spawn($, 'Fix the test')

  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests', run_in_background: true, agentId: 'a1' })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Serve the app', run_in_background: true })
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // Whether a task's row, by its label after the `shell` column, says finished.
  const finished = async (label: string) =>
    new RegExp(`shell\\s+${label}\\s+› finished`).test((await drawn(ui)).join(''))

  // A stop that gives no list says nothing.
  await $.classic.Stop({ stop_hook_active: false })
  await clock.advance(500)
  expect((await drawn(ui)).join('')).not.toContain('finished')

  // The agent's command is gone from the list: it finished; the other runs on.
  await $.classic.SubagentStop({
    stop_hook_active: false,
    agent_id: 'a1',
    agent_transcript_path: '',
    agent_type: 'implementer',
    background_tasks: [{ id: 'b2', type: 'shell', status: 'running', description: 'Serve the app' }],
  })
  await clock.advance(500)
  expect(await finished('Run the tests')).toBe(true)
  expect(await finished('Serve the app')).toBe(false)

  // An empty list ends the rest.
  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await clock.advance(500)
  expect(await finished('Serve the app')).toBe(true)
  await ui.unmount()
})

test("a subagent's command ends on the notification its conversation receives", async ($, on) => {
  const clock = mock.clock(on)
  const agents: AgentInfo[] = [{ id: 'a1', description: 'Fix the test', type: 'implementer', status: 'running' }]
  setup(on, () => agents)
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'a1' }))
  let next = 0
  on('tool.call', { tool: 'Bash' }, () => ({ result: { ...BASH_BG, backgroundTaskId: `b${++next}` } }))
  await spawn($, 'Fix the test')

  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests', run_in_background: true, agentId: 'a1' })
  await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Serve the app', run_in_background: true, agentId: 'a1' })
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const finished = async (label: string) =>
    new RegExp(`shell\\s+${label}\\s+› finished`).test((await drawn(ui)).join(''))

  const append = (
    text: string,
    row: Partial<{ type: 'attachment' | 'assistant'; door: 'queue' | 'tool-result'; agentId: string }> = {},
  ) =>
    $.session.append({
      message: { type: row.type ?? 'attachment', role: row.type ?? 'user', content: [{ type: 'text', text }] },
      door: row.door ?? 'queue',
      origin: { kind: 'task-notification' },
      uuid: `u${++next}`,
      ...('agentId' in row ? (row.agentId ? { agentId: row.agentId } : {}) : { agentId: 'a1' }),
    } as never)
  const done = (id: string) => `<system-reminder>\n${notify([`<task-id>${id}</task-id>\n<status>completed</status>`])}\n</system-reminder>`

  // The agent's own reply and a tool result that quote a notification end nothing.
  await append(done('b1'), { type: 'assistant', door: 'queue' })
  await append(done('b1'), { door: 'tool-result' })
  await clock.advance(500)
  expect(await finished('Run the tests')).toBe(false)

  // The notification delivered to the agent ends its command while the agent runs on.
  await append(done('b1'))
  await clock.advance(500)
  expect(await finished('Run the tests')).toBe(true)
  expect(await finished('Serve the app')).toBe(false)
  expect((await drawn(ui)).join('')).toContain('Fix the test')
  await ui.unmount()
})

test('a prompt that is not a notification changes no task', async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  on('tool.call', { tool: 'Bash' }, () => ({ result: BASH_BG }))

  await $.tool.call({ tool: 'Bash', command: 'npm test', description: 'Run the tests', run_in_background: true })
  await clock.advance(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  await submit($, notify(['<task-id>b1</task-id>\n<status>completed</status>']), 'composer')
  await clock.advance(500)
  expect((await drawn(ui)).join('')).not.toContain('finished')
  await ui.unmount()
})

// Records each notification sent, answering as a terminal bell would.
function notifications(on: On) {
  const sent: string[] = []
  on('ui.notify', (_$, e) => {
    sent.push(e.text)

    return { value: { isSent: true, channel: 'terminal_bell' } }
  })

  return sent
}

test('notifies when the main loop stops with nothing in flight', { options: { notifyWhenIdle: true } }, async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  const sent = notifications(on)
  on('classic.Stop', () => ({}))

  // Still waiting on a task: no notification.
  await $.classic.Stop({
    stop_hook_active: false,
    background_tasks: [{ id: 'b1', type: 'shell', status: 'running', description: 'Run the tests' }],
  })
  // No list given: unknown, so no notification.
  await $.classic.Stop({ stop_hook_active: false })
  await clock.advance(500)
  expect(sent).toEqual([])

  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await clock.advance(500)
  expect(sent).toEqual(['Claude is idle: no background tasks running'])
})

test('a stop another hook blocks sends no notification', { options: { notifyWhenIdle: true } }, async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  const sent = notifications(on)
  on('classic.Stop', () => ({ block: 'keep going' }))

  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await clock.advance(500)
  expect(sent).toEqual([])
})

test('sends no notification when the option is off', async ($, on) => {
  const clock = mock.clock(on)
  setup(on, () => [])
  const sent = notifications(on)
  on('classic.Stop', () => ({}))

  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] })
  await clock.advance(500)
  expect(sent).toEqual([])
})
