export type AgentRow = { id: string; label: string; type: string; status: string; isQuiet: boolean }

declare module 'claude-code' {
  interface PluginState {
    'agent-spinners': { rows: AgentRow[] }
  }
}
