import type { AgentInfo } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

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
  expect((await mark())?.props.color).toBe('gray')

  // Back to running, it spins on from the live frame in cyan.
  agents = [{ ...agents[0]!, status: 'running' }]
  await clock.advance(500)
  await ui.advance(80)
  expect((await mark())?.props.color).toBe('cyan')
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
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: 'finished' }))?.props.color).toBe('green')
  expect((await ui.findAll({ in: 'agent-spinners', type: 'Text' }))[0]?.props.color).toBe('gray')

  agents = [{ ...agents[0]!, status: 'killed' }]
  await clock.advance(500)
  expect(await row()).toBe('Scope the repo › stopped')
  expect((await ui.find({ in: 'agent-spinners', type: 'Text', text: 'stopped' }))?.props.color).toBe('red')
  await ui.unmount()
})
