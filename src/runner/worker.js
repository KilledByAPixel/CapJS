// Worker-mode entry. The first message is {type:'init', canvas} with a transferred
// OffscreenCanvas; every later request goes to the shared runtime.

import { createRuntime } from './runtime.js'
import { errorInfo, makeReply, transferList } from './protocol.js'

let runtime = null

self.onmessage = async ({ data: msg }) => {
  let reply
  if (msg.type === 'init') {
    runtime = createRuntime({ canvas: msg.canvas, globalScope: self })
    reply = makeReply(msg.id)
  } else if (!runtime) {
    reply = makeReply(msg.id, { error: errorInfo('Worker received a request before init') })
  } else {
    reply = await runtime.handle(msg) // the runtime queues requests in arrival order
  }
  postMessage(reply, transferList(reply))
}
