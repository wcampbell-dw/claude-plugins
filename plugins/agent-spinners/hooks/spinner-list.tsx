import type { ClientModule } from 'claude-code'

import type { AgentRow } from '../types'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80
const NAME_WIDTH = 16
const LABEL_WIDTH = 32

// What the status column says for an agent that has ended, in place of its
// last tool call.
const ENDED: Record<string, { text: string; color: string }> = {
  completed: { text: 'finished', color: 'green' },
  failed: { text: 'failed', color: 'red' },
  killed: { text: 'stopped', color: 'red' },
}

// The fewest characters of a plugin's name worth keeping before dropping it.
const MIN_PLUGIN = 3

// Fits the agent type to NAME_WIDTH so the columns line up. A plugin's agent
// (`plugin:agent`) gives up its plugin name first: `mattpoc…research`, then
// `research`, and only then is the agent's own name cut: `rese…`.
const shorten = (name: string) => {
  if (name.length <= NAME_WIDTH) return name

  const colon = name.indexOf(':')
  const agent = colon === -1 ? name : name.slice(colon + 1)
  const room = NAME_WIDTH - agent.length - 1

  if (colon !== -1 && room >= MIN_PLUGIN) return `${name.slice(0, room)}…${agent}`
  if (agent.length <= NAME_WIDTH) return agent

  return `${agent.slice(0, NAME_WIDTH - 1)}…`
}

const fit = (name: string) => shorten(name).padEnd(NAME_WIDTH)

// Fits the title to LABEL_WIDTH so the status column lines up.
const fitLabel = (label: string) =>
  (label.length <= LABEL_WIDTH ? label : `${label.slice(0, LABEL_WIDTH - 1)}…`).padEnd(LABEL_WIDTH)

type State = { frame: number }

// The spinner frame each row last drew, so an idle row can hold it.
const shownFrame = new Map<string, number>()

const spin = (row: AgentRow, index: number, color: string) => {
  shownFrame.set(row.id, index)

  return { mark: FRAMES[index % FRAMES.length], color }
}

const glyph = (row: AgentRow, frame: number) => {
  switch (row.status) {
    case 'running':
      return spin(row, frame, 'cyan')
    case 'pending':
    case 'waiting':
      // Slower spin for an agent that's queued or blocked.
      return spin(row, Math.floor(frame / 3), 'yellow')
    default:
      // Idle or ended: frozen on the frame it stopped at.
      return { mark: FRAMES[(shownFrame.get(row.id) ?? 0) % FRAMES.length], color: 'gray' }
  }
}

const SpinnerList: ClientModule<{ rows: AgentRow[] }, State> = (props, surface) => {
  if (surface.state === undefined) {
    let frame = 0
    surface.every(FRAME_MS, () => surface.setState({ frame: ++frame }))
    surface.setState({ frame })
  }

  const frame = surface.state?.frame ?? 0
  const { Box, Text } = surface.elements

  const ids = new Set(props.rows.map(row => row.id))
  for (const id of shownFrame.keys()) {
    if (!ids.has(id)) shownFrame.delete(id)
  }

  return (
    <Box flexDirection="column">
      {props.rows.map(row => {
        const { mark, color } = glyph(row, frame)
        const ended = ENDED[row.status]
        const status = ended ?? (row.activity ? { text: row.activity, color: undefined } : undefined)

        return (
          <Box key={row.id}>
            <Text color={color}>{mark} </Text>
            <Text dimColor>{fit(row.type)} </Text>
            <Text dimColor={row.isQuiet}>{fitLabel(row.label)}</Text>
            {status ? <Text dimColor> › </Text> : null}
            {status ? (
              <Text color={status.color} dimColor={row.isQuiet} wrap="truncate-end">
                {status.text}
              </Text>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )
}

export default SpinnerList
