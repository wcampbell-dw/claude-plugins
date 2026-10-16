import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register, Timer } from 'claude-code'

import type { AgentRow } from '../types'

const rowsAtom = atom({ plugin: 'agent-spinners', key: 'rows' } as const, [] as AgentRow[])

const ACTIVE = new Set(['pending', 'running', 'waiting', 'idle'])
// How long a finished agent stays listed.
const LINGER_MS = 8000
// How long a live agent goes without a change (status, or a tool call
// starting or ending) before its row dims.
const QUIET_MS = 5000
const POLL_MS = 500
// How long a toast stays: longer when an agent is waiting on you.
const TOAST_MS = 6000
const ATTENTION_TOAST_MS = 12000

// What the status column says for an agent that has ended.
const ENDED: Record<string, string> = { completed: 'finished', failed: 'failed', killed: 'stopped' }

// The longest activity text kept; the row cuts it shorter at the edge.
const ACTIVITY_MAX = 80

let timer: Timer | undefined
let last = '[]'
const lastStatus = new Map<string, string>()
const changedAt = new Map<string, number>()
const activity = new Map<string, string>()

// The argument that says what a call is doing, by preference: Bash's
// description before its command, a file by its name alone.
const ARG_KEYS = ['description', 'file_path', 'notebook_path', 'pattern', 'query', 'url', 'command', 'skill', 'prompt']

const describe = (e: { tool: string }) => {
  const args = e as unknown as Record<string, unknown>
  // An MCP tool (`mcp__server__tool`) goes by its own name.
  const tool = e.tool.startsWith('mcp__') ? e.tool.split('__').slice(2).join('__') || e.tool : e.tool

  for (const key of ARG_KEYS) {
    const value = args[key]
    if (typeof value !== 'string' || !value.trim()) continue

    const text = key.endsWith('_path') ? (value.split(/[\\/]/).pop() ?? value) : value
    const line = `${tool}: ${text.replace(/\s+/g, ' ').trim()}`

    return line.length > ACTIVITY_MAX ? `${line.slice(0, ACTIVITY_MAX - 1)}…` : line
  }

  return tool
}

// What a toast says when an agent moves into a status, by status; a status
// not listed here raises no toast.
const NOTICES: Record<string, string> = {
  completed: '✓ {type} finished: {label}',
  failed: '✗ {type} failed: {label}',
  killed: '✗ {type} was stopped: {label}',
  waiting: '⏳ {type} needs attention: {label}',
}

async function refresh($: Engine) {
  const now = await $.clock.now()
  const rows: AgentRow[] = []

  for (const agent of await $.agent.list()) {
    const previous = lastStatus.get(agent.id)
    if (previous !== agent.status) {
      lastStatus.set(agent.id, agent.status)
      changedAt.set(agent.id, now)

      // An agent first seen already in a status (after a reload) says nothing.
      const notice = NOTICES[agent.status]
      if (previous !== undefined && notice) {
        $.ui.toast(
          notice
            .replace('{type}', agent.type)
            .replace('{label}', agent.description || agent.name || agent.type),
          { timeoutMs: agent.status === 'waiting' ? ATTENTION_TOAST_MS : TOAST_MS },
        )
      }
    }

    const sinceChange = now - (changedAt.get(agent.id) ?? now)
    if (!ACTIVE.has(agent.status) && sinceChange >= LINGER_MS) continue

    rows.push({
      id: agent.id,
      label: agent.description || agent.name || agent.type,
      type: agent.type,
      status: agent.status,
      // An agent that has ended stays bright until it drops off.
      isQuiet: ACTIVE.has(agent.status) && sinceChange >= QUIET_MS,
      ...(ACTIVE.has(agent.status) && activity.has(agent.id) ? { activity: activity.get(agent.id) } : {}),
    })
  }

  const listed = new Set(rows.map(row => row.id))
  for (const id of activity.keys()) {
    if (!listed.has(id)) activity.delete(id)
  }

  const next = JSON.stringify(rows)
  if (next !== last) {
    last = next
    await update($, rowsAtom, () => rows)
  }

  if (rows.length === 0 && timer) {
    timer.cancel()
    timer = undefined
  }
}

function watch($: Engine) {
  timer ??= $.clock.every(POLL_MS, () => void refresh($))
  void refresh($)
}

async function touch($: Engine, agentId: string) {
  changedAt.set(agentId, await $.clock.now())
  watch($)
}

export const register: Register = on => {
  on('session.start', ($, e, next) => {
    watch($)

    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    watch($)

    return result
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      activity.set(e.agentId, describe(e))
      void touch($, e.agentId)
    }
    const result = await next(e)
    if (e.agentId) void touch($, e.agentId)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const rows = await read($, rowsAtom)

    if (e.props.hasSurvey || rows.length === 0) {
      return next(e)
    }

    if (e.surface === 'terminal' || e.surface === 'desktop') {
      const { Client } = $.ui.resolve(e)

      return <Client key="agent-spinners" module="./spinner-list.tsx" props={{ rows }} />
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {rows.map(row => (
          <Text key={row.id} dimColor={row.isQuiet}>
            {ACTIVE.has(row.status) ? '●' : '○'} {row.label}
            {ENDED[row.status] ?? row.activity ? ` › ${ENDED[row.status] ?? row.activity}` : ''}
          </Text>
        ))}
      </Box>
    )
  })
}
