// Message protocol shared by the main-side runner, worker.js and frame.js.
//
// Requests (main -> runtime), each with an `id` and answered by exactly one reply:
//   {type:'init', id, canvas}                         worker only, first message, canvas transferred
//   {type:'load', id, mode, code, width, height, background, loopProtect}   resets all state
//   {type:'setCode', id, code}                        hot-swaps the program, keeps canvas and globals
//   {type:'frames', id, frames, budgetMs, grab}       runs one step per index, in order
//   {type:'grab', id}                                 replies with a bitmap (null for html/js)
//   {type:'image', id, bitmap}                        custom image, or null to clear it
//   {type:'mouse', id, x, y, z, w}                    canvas-pixel mouse state (Shadertoy iMouse)
//
// Reply: {type:'reply', id, error:{message, line}|null, console, bitmap?}
// Unsolicited (frame.js only): {type:'ready'} once listening, {type:'error', error:{message, line}}

export const MODES = ['dweet', 'three', 'shadertoy', 'html', 'js', 'littlejs']

// Modes that draw to a canvas through createRuntime.
export const CANVAS_MODES = ['dweet', 'three', 'shadertoy']

export function errorInfo(message, line = null) {
  return { message: String(message), line: line ?? null }
}

export function makeReply(id, { error = null, console = '', bitmap } = {}) {
  const reply = { type: 'reply', id, error, console }
  if (bitmap !== undefined) reply.bitmap = bitmap
  return reply
}

// Bitmaps in a reply are transferred, not copied.
export function transferList(reply) {
  return reply.bitmap ? [reply.bitmap] : []
}
