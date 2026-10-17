// Maps runtime error stacks back to editor lines.

// Lines the runtime's Function wrapper adds before the user's code.
export const DWEET_LINE_OFFSET = 2

export function parseErrorLine(stack, offset = DWEET_LINE_OFFSET) {
  const m = /<anonymous>:(\d+):\d+/.exec(stack || '')
  if (!m) return null
  const line = +m[1] - offset
  return line < 1 ? null : line
}
