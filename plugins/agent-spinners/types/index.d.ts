export type AgentRow = {
  id: string
  label: string
  type: string
  status: string
  // An agent, or a background task: a shell command or a monitor.
  kind: 'agent' | 'shell' | 'monitor'
  // A task an agent started, drawn right under that agent's row.
  isChild?: boolean
  isQuiet: boolean
  // The agent's latest tool call (`Bash: run the tests`), or a monitor's
  // latest event, while it's live.
  activity?: string
}

// A background task, tracked by the mod as the API lists none.
export type TaskRecord = {
  id: string
  kind: 'shell' | 'monitor'
  label: string
  // The subagent that started it; absent for the main loop.
  agentId?: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  changedAt: number
  // A monitor's latest event.
  activity?: string
  // Killed when its agent finishes, so no notification follows.
  endsWithParent: boolean
  // When a monitor still running is taken to have ended.
  deadline?: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-spinners': { rows: AgentRow[]; tasks: TaskRecord[] }
  }
}
