import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BASE = { id: 'intro', text: 'You are Claude Code.', scope: 'shared' } as const

const setup = (on: On) => {
  on('fs.read', ($, e) =>
    e.path.replace(/\\/g, '/').endsWith('/DELEGATION.md')
      ? { value: '# Subagent delegation\n' }
      : { deny: `ENOENT ${e.path}` },
  )
  on('prompt.compose', () => ({ sections: [BASE] }))
}

const compose = (tools: string[]) => ({
  model: 'claude-opus-5-5',
  promptModel: 'claude-opus-5-5',
  surfaces: [],
  tools,
  outputStyle: null,
  traits: [],
})

test('adds the delegation rules to a prompt that offers the Agent tool', async ($, on) => {
  setup(on)

  const { sections } = await $.prompt.compose(compose(['Read', 'Agent']))

  expect(sections).toEqual([
    BASE,
    { id: 'subagent-kit:delegation', text: '# Subagent delegation\n', scope: 'session' },
  ])
})

test('leaves a prompt without the Agent tool alone', async ($, on) => {
  setup(on)

  const { sections } = await $.prompt.compose(compose(['Read', 'Edit']))

  expect(sections).toEqual([BASE])
})
