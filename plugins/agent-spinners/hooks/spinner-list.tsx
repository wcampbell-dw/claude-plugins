import type { ClientModule } from 'claude-code'

import type { AgentRow } from '../types'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_MS = 80
// A child row's lead, its `└` under the first letter of its agent's type.
const CHILD_LEAD = '  └  '
const SEPARATOR = ' › '

// What the status column says for an agent that has ended, in place of its
// last tool call.
const ENDED: Record<string, { text: string; color: string }> = {
  completed: { text: 'finished', color: 'success' },
  failed: { text: 'failed', color: 'error' },
  killed: { text: 'stopped', color: 'error' },
}

// A plugin's agent (`plugin:agent`) goes by its own name; a task's kind has no
// plugin and stays as is.
const agentName = (type: string) => type.slice(type.indexOf(':') + 1)

const segmenter = new Intl.Segmenter()

// Characters drawn two cells wide: East Asian Wide and Fullwidth, and emoji.
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-꓏ꥠ-꥿가-힣豈-﫿︰-﹯＀-｠￠-￦]|\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{20000}-\u{3fffd}]/u

// Characters that take no cell of their own: marks, the joiner, and variation
// selectors.
const ZERO = /[\p{M}​-‍︀-️]/u

// The terminal cells one grapheme takes.
const cells = (grapheme: string) => {
  if (WIDE.test(grapheme)) return 2

  return [...grapheme].filter(char => !ZERO.test(char)).length
}

const width = (text: string) => {
  let total = 0
  for (const { segment } of segmenter.segment(text)) total += cells(segment)

  return total
}

// The start of `text` that fits `room` cells, never splitting a grapheme.
const head = (text: string, room: number) => {
  let out = ''
  for (const { segment } of segmenter.segment(text)) {
    room -= cells(segment)
    if (room < 0) break
    out += segment
  }

  return out
}

// One run of a row. A `fixed` run is never cut, a `sep` run is cut whole or
// not at all.
type Part = { text: string; color?: string; dim?: boolean; fixed?: boolean; sep?: boolean }

// Cuts the row once at the band's edge with a `…` as its last cell, so the
// status goes first, then the title, then the type. The cut drops any space it
// would leave before the `…`, and a separator with nothing after it. Before the
// first layout (`columns` 0), nothing is cut.
const fitRow = (parts: Part[], columns: number) => {
  if (columns <= 0 || parts.reduce((total, part) => total + width(part.text), 0) <= columns) return parts

  let room = columns - 1
  const kept: Part[] = []
  for (const part of parts) {
    const size = width(part.text)
    if (part.fixed || size <= room) {
      kept.push(part)
      room -= size
      continue
    }

    kept.push({ ...part, text: part.sep ? '' : head(part.text, room) })
    break
  }

  while (kept.length > 1 && (kept.at(-1)!.sep || kept.at(-1)!.text === '')) kept.pop()

  const last = kept.at(-1)!
  kept[kept.length - 1] = { ...last, text: `${last.text.trimEnd()}…` }

  return kept
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

        const parts: Part[] = []
        if (row.isChild) parts.push({ text: CHILD_LEAD, dim: true, fixed: true })
        parts.push({ text: `${mark} `, color, fixed: true })
        parts.push({ text: `${agentName(row.type)} `, dim: true })
        if (row.label) parts.push({ text: row.label, dim: row.isQuiet })
        if (status) {
          parts.push({ text: SEPARATOR, dim: true, sep: true })
          parts.push({ text: status.text, color: status.color, dim: row.isQuiet })
        }

        // Every run truncates rather than wraps, should the band still be
        // narrower than the row's fixed lead and spinner.
        return (
          <Box key={row.id}>
            {fitRow(parts, surface.columns).map((part, i) => (
              <Text key={i} color={part.color} dimColor={part.dim} wrap="truncate-end">
                {part.text}
              </Text>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

export default SpinnerList
