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

let timer: Timer | undefined
let last = '[]'
const lastStatus = new Map<string, string>()
const changedAt = new Map<string, number>()

async function refresh($: Engine) {
  const now = await $.clock.now()
  const rows: AgentRow[] = []

  for (const agent of await $.agent.list()) {
    if (lastStatus.get(agent.id) !== agent.status) {
      lastStatus.set(agent.id, agent.status)
      changedAt.set(agent.id, now)
    }

    const sinceChange = now - (changedAt.get(agent.id) ?? now)
    if (!ACTIVE.has(agent.status) && sinceChange >= LINGER_MS) continue

    rows.push({
      id: agent.id,
      label: agent.description || agent.name || agent.type,
      type: agent.type,
      status: agent.status,
      isQuiet: sinceChange >= QUIET_MS,
    })
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
    if (e.agentId) void touch($, e.agentId)
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
            {ACTIVE.has(row.status) ? '●' : row.status === 'completed' ? '✓' : '✗'} {row.label}
          </Text>
        ))}
      </Box>
    )
  })
}
