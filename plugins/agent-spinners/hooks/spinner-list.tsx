import type { ClientModule } from 'claude-code'

import type { AgentRow } from '../types'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80
const NAME_WIDTH = 16
const LABEL_WIDTH = 32
// A child row's lead, its `└` under the first letter of its agent's type,
// and the width it takes from the type column.
const CHILD_LEAD = '  └  '
const CHILD_INDENT = CHILD_LEAD.length

// What the status column says for an agent that has ended, in place of its
// last tool call.
const ENDED: Record<string, { text: string; color: string }> = {
  completed: { text: 'finished', color: 'success' },
  failed: { text: 'failed', color: 'error' },
  killed: { text: 'stopped', color: 'error' },
}

// Cuts `text` to `width` with a `…`, dropping any space the cut leaves before
// it.
const cut = (text: string, width: number) =>
  text.length <= width ? text : `${text.slice(0, width - 1).trimEnd()}…`

// The fewest characters of a plugin's name worth keeping before dropping it.
const MIN_PLUGIN = 3

// Plugins whose agents always go by their own name, without the plugin's.
const BARE_PLUGINS = ['subagent-kit']

// Fits the agent type (or a task's kind) to `width` so the columns line up.
// A plugin's agent (`plugin:agent`) gives up its plugin name first:
// `mattpoc…research`, then `research`, and only then is the agent's own name
// cut: `rese…`. A `BARE_PLUGINS` agent shows as `implementer` from the start.
const shorten = (name: string, width: number) => {
  const bare = BARE_PLUGINS.find(plugin => name.startsWith(`${plugin}:`))
  if (bare) name = name.slice(bare.length + 1)
  if (name.length <= width) return name

  const colon = name.indexOf(':')
  const agent = colon === -1 ? name : name.slice(colon + 1)
  const room = width - agent.length - 1

  if (colon !== -1 && room >= MIN_PLUGIN) return `${name.slice(0, room).trimEnd()}…${agent}`

  return cut(agent, width)
}

const fit = (name: string, width: number) => shorten(name, width).padEnd(width)

// Fits the title to `width` so the status column lines up.
const fitLabel = (label: string, width: number) => cut(label, width).padEnd(width)

// The spinner and its space, and the space after the type column.
const MARK_WIDTH = 2
const GAP = 1
const SEPARATOR = ' › '
// The narrowest the type column and title get before the next one gives way,
// and the least of a status worth drawing.
const MIN_NAME = 8
const MIN_LABEL = 8
const MIN_STATUS = 4

// `status` is the room left for the status after its separator, 0 with too
// little to show it.
type Layout = { name: number; label: number; status: number }

// Sizes the columns to the band's width so a row never wraps: the title gives
// way first, then the type column, and the status shows only with room left,
// cut to that room so a long one can't push the row past the band's edge.
// Before the first layout (`columns` 0), the full widths and an uncut status.
const layout = (columns: number): Layout => {
  if (columns <= 0) return { name: NAME_WIDTH, label: LABEL_WIDTH, status: Infinity }

  const name = Math.max(MIN_NAME, Math.min(NAME_WIDTH, columns - MARK_WIDTH - GAP - MIN_LABEL))
  const label = Math.max(0, Math.min(LABEL_WIDTH, columns - MARK_WIDTH - GAP - name))
  const rest = columns - MARK_WIDTH - GAP - name - label

  const status = rest - SEPARATOR.length

  return { name, label, status: status >= MIN_STATUS ? status : 0 }
}

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
      // Colors are theme keys, so they follow the person's theme: under an
      // ANSI theme, an agent in the terminal's magenta (the statusline's model
      // color), a task in its cyan.
      return spin(row, frame, row.kind === 'agent' ? 'merged' : 'planMode')
    case 'pending':
    case 'waiting':
      // Slower spin for an agent that's queued or blocked.
      return spin(row, Math.floor(frame / 3), 'warning')
    default:
      // Idle or ended: frozen on the frame it stopped at.
      return { mark: FRAMES[(shownFrame.get(row.id) ?? 0) % FRAMES.length], color: 'inactive' }
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
  const widths = layout(surface.columns)

  const ids = new Set(props.rows.map(row => row.id))
  for (const id of shownFrame.keys()) {
    if (!ids.has(id)) shownFrame.delete(id)
  }

  return (
    <Box flexDirection="column">
      {props.rows.map(row => {
        const { mark, color } = glyph(row, frame)
        const ended = ENDED[row.status]
        const status = widths.status
          ? (ended ?? (row.activity ? { text: row.activity, color: undefined } : undefined))
          : undefined

        // Every run truncates rather than wraps, should the band still be
        // narrower than the columns at their least.
        return (
          <Box key={row.id}>
            {row.isChild ? (
              <Text dimColor wrap="truncate-end">
                {CHILD_LEAD}
              </Text>
            ) : null}
            <Text color={color} wrap="truncate-end">
              {`${mark} `}
            </Text>
            <Text dimColor wrap="truncate-end">
              {`${fit(row.type, row.isChild ? widths.name - CHILD_INDENT : widths.name)} `}
            </Text>
            {widths.label > 0 ? (
              <Text dimColor={row.isQuiet} wrap="truncate-end">
                {fitLabel(row.label, widths.label)}
              </Text>
            ) : null}
            {status ? (
              <Text dimColor wrap="truncate-end">
                {SEPARATOR}
              </Text>
            ) : null}
            {status ? (
              <Text color={status.color} dimColor={row.isQuiet} wrap="truncate-end">
                {cut(status.text, widths.status)}
              </Text>
            ) : null}
          </Box>
        )
      })}
    </Box>
  )
}

export default SpinnerList
