import type { Register } from 'claude-code'

// Adds DELEGATION.md to the system prompt, the way an import line in ~/.claude/CLAUDE.md
// would. Only prompts that offer the Agent tool get it: the agents themselves cannot delegate.
const SECTION = 'subagent-kit:delegation'

export const register: Register = on => {
  let rules: Promise<string> | undefined

  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    if (!e.tools.includes('Agent')) return result
    rules ??= $.fs.read(`${$.plugin.root}/DELEGATION.md`) as Promise<string>
    return { sections: [...result.sections, { id: SECTION, text: await rules, scope: 'session' }] }
  })
}
