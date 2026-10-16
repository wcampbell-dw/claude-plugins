export type AgentRow = {
  id: string
  label: string
  type: string
  status: string
  isQuiet: boolean
  // The agent's latest tool call (`Bash: run the tests`), while it's live.
  activity?: string
}

declare module 'claude-code' {
  interface PluginState {
    'agent-spinners': { rows: AgentRow[] }
  }
}
