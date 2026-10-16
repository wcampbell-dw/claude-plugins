import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register, Timer } from 'claude-code'

import type { AgentRow, TaskRecord } from '../types'

const rowsAtom = atom({ plugin: 'agent-spinners', key: 'rows' } as const, [] as AgentRow[])
// Background tasks, kept here so a hot reload doesn't lose them.
const tasksAtom = atom({ plugin: 'agent-spinners', key: 'tasks' } as const, [] as TaskRecord[])

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
// The longest task label kept.
const LABEL_MAX = 120
// How long past its timeout a monitor is given to say it ended before it is
// taken to have.
const DEADLINE_GRACE_MS = 5000

let timer: Timer | undefined
let last = '[]'
const lastStatus = new Map<string, string>()
const changedAt = new Map<string, number>()
const activity = new Map<string, string>()

// The argument that says what a call is doing, by preference: Bash's
// description before its command, a file by its name alone.
const ARG_KEYS = ['description', 'file_path', 'notebook_path', 'pattern', 'query', 'url', 'command', 'skill', 'prompt']

const squash = (text: string, max: number) => {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

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

const rowOf = (task: TaskRecord, now: number, isChild: boolean): AgentRow => ({
  id: `task:${task.id}`,
  label: task.label,
  type: task.kind,
  kind: task.kind,
  status: task.status,
  isQuiet: task.status === 'running' && now - task.changedAt >= QUIET_MS,
  ...(isChild ? { isChild } : {}),
  ...(task.status === 'running' && task.activity ? { activity: task.activity } : {}),
})

// Ends the tasks whose notification may never come, and drops those that
// have lingered. Returns the tasks as they now stand.
function settle(tasks: TaskRecord[], agents: Map<string, string>, now: number) {
  return tasks.flatMap(task => {
    let status = task.status

    if (status === 'running') {
      const parent = task.agentId ? agents.get(task.agentId) : undefined
      if (task.deadline !== undefined && now > task.deadline) status = 'completed'
      else if (task.endsWithParent && task.agentId && (parent === undefined || !ACTIVE.has(parent))) status = 'killed'
    }

    const next = status === task.status ? task : { ...task, status, changedAt: now }

    return next.status !== 'running' && now - next.changedAt >= LINGER_MS ? [] : [next]
  })
}

async function refresh($: Engine) {
  const now = await $.clock.now()
  const rows: AgentRow[] = []
  const agents = await $.agent.list()

  for (const agent of agents) {
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

    const row: AgentRow = {
      id: agent.id,
      label: agent.description || agent.name || agent.type,
      type: agent.type,
      kind: 'agent',
      status: agent.status,
      // An agent that has ended stays bright until it drops off.
      isQuiet: ACTIVE.has(agent.status) && sinceChange >= QUIET_MS,
      ...(ACTIVE.has(agent.status) && activity.has(agent.id) ? { activity: activity.get(agent.id) } : {}),
    }
    rows.push(row)
  }

  const states = new Map(agents.map(agent => [agent.id, agent.status]))
  let tasks = await read($, tasksAtom)
  const settled = settle(tasks, states, now)
  if (JSON.stringify(settled) !== JSON.stringify(tasks)) {
    // Settled again on what the atom holds by then, in case a task was added.
    await update($, tasksAtom, current => (tasks = settle(current, states, now)))
  }

  // A task goes right after its agent's row; one with no listed agent goes
  // after all of them.
  const listed = new Set(rows.map(row => row.id))
  const loose: AgentRow[] = []
  const children = new Map<string, AgentRow[]>()
  for (const task of tasks) {
    if (task.agentId && listed.has(task.agentId)) {
      children.set(task.agentId, [...(children.get(task.agentId) ?? []), rowOf(task, now, true)])
    } else {
      loose.push(rowOf(task, now, false))
    }
  }
  const ordered = [...rows.flatMap(row => [row, ...(children.get(row.id) ?? [])]), ...loose]

  for (const id of activity.keys()) {
    if (!listed.has(id)) activity.delete(id)
  }

  const next = JSON.stringify(ordered)
  if (next !== last) {
    last = next
    await update($, rowsAtom, () => ordered)
  }

  if (ordered.length === 0 && timer) {
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

type Call = {
  tool: string
  agentId?: string
  description?: string
  command?: string
  task_id?: string
  shell_id?: string
}

// Notes a task a call started, or marks one a call stopped.
async function track($: Engine, e: Call, output: unknown) {
  const out = (output ?? {}) as Record<string, unknown>
  const now = await $.clock.now()
  let started: TaskRecord | undefined

  if (e.tool === 'Bash' && typeof out.backgroundTaskId === 'string') {
    started = {
      id: out.backgroundTaskId,
      kind: 'shell',
      label: squash(e.description || e.command || out.backgroundTaskId, LABEL_MAX),
      status: 'running',
      changedAt: now,
      // Killed when its agent finishes, so no notification follows.
      endsWithParent: out.backgroundEndsWithFinalResponse === true,
    }
  } else if (e.tool === 'Monitor' && typeof out.taskId === 'string') {
    const timeoutMs = typeof out.timeoutMs === 'number' ? out.timeoutMs : 0
    started = {
      id: out.taskId,
      kind: 'monitor',
      label: squash(e.description || out.taskId, LABEL_MAX),
      status: 'running',
      changedAt: now,
      endsWithParent: false,
      ...(out.persistent !== true && timeoutMs > 0 ? { deadline: now + timeoutMs + DEADLINE_GRACE_MS } : {}),
    }
  } else if (e.tool === 'TaskStop') {
    const id = e.task_id ?? e.shell_id
    if (id === undefined) return

    await update($, tasksAtom, tasks =>
      tasks.map(task => (task.id === id && task.status === 'running' ? { ...task, status: 'killed', changedAt: now } : task)),
    )
    watch($)

    return
  }

  if (!started) return
  const task: TaskRecord = e.agentId ? { ...started, agentId: e.agentId } : started

  await update($, tasksAtom, tasks => [...tasks.filter(other => other.id !== task.id), task])
  watch($)
}

const field = (block: string, name: string) => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)?.[1]

// Applies the `<task-notification>` blocks a prompt's text carries to the
// tasks tracked here; an id not tracked is ignored.
async function notified($: Engine, text: string) {
  const blocks = [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)].map(match => match[1]!)
  if (blocks.length === 0) return

  const now = await $.clock.now()
  await update($, tasksAtom, tasks =>
    blocks.reduce((all, block) => {
      const id = field(block, 'task-id')?.trim()
      const status = field(block, 'status')?.trim()
      const event = field(block, 'event')
        ?.split('\n')
        .find(line => line.trim())

      return all.map(task => {
        if (task.id !== id || task.status !== 'running') return task
        if (status) {
          return { ...task, status: status === 'failed' || status === 'killed' ? status : 'completed', changedAt: now }
        }

        return event ? { ...task, activity: squash(event, ACTIVITY_MAX), changedAt: now } : task
      })
    }, tasks),
  )
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
    if (!result.deny && !result.isError) await track($, e, result.result)

    return result
  })

  // A background task's end, and a monitor's events, reach the session as a
  // prompt. Only observed: the prompt goes on unchanged.
  on('prompt.submit', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') await notified($, e.text)

    return next(e)
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
            {row.isChild ? '  └ ' : ''}
            {ACTIVE.has(row.status) ? '●' : '○'} {row.label}
            {ENDED[row.status] ?? row.activity ? ` › ${ENDED[row.status] ?? row.activity}` : ''}
          </Text>
        ))}
      </Box>
    )
  })
}
