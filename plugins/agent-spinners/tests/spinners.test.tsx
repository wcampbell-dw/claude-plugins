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

  // The type leads, padded to a fixed column; a long one is cut with an ellipsis.
  expect(await ui.find({ in: 'agent-spinners', type: 'Text', text: 'scoper           ' })).toBeDefined()

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

test('long names give up the plugin name before the agent name', async ($, on) => {
  const clock = mock.clock(on)
  const names: [string, string][] = [
    ['general-purpose', 'general-purpose '],
    ['mattpocock-skills:research', 'mattpoc…research'],
    ['pluginname:research-x', 'plugi…research-x'],
    ['plugin:researcher-x1', 'researcher-x1   '],
    ['pluginname:researcher-x12', 'researcher-x12  '],
    ['lab:an-extremely-long-agent', 'an-extremely-lo…'],
    ['an-extremely-long-builtin', 'an-extremely-lo…'],
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
  // The row past the spinner and the type, its padding squeezed.
  const row = async () =>
    (await ui.findAll({ in: 'agent-spinners', type: 'Text' }))
      .slice(2)
      .map(t => t.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim()

  // Nothing called yet: the title alone, padded to a fixed column.
  expect(await row()).toBe('Scope the repo')
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: /Scope the repo/ }))?.text).toHaveLength(32)

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

test('a monitor an agent started sits under that agent, its type fitted to 12 columns', async ($, on) => {
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
  expect(texts).toContain('  └ ')
  expect(texts).toContain('monitor      ')
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
