// Test process preload. This is a runtime guard for Node networking, not an OS sandbox.
const { syncBuiltinESMExports } = require('node:module')
const deny = (name) =>
  function () {
    throw new Error(`r1-network-trap:${name}`)
  }
globalThis.fetch = deny('fetch')
if (globalThis.WebSocket) globalThis.WebSocket = deny('WebSocket')
for (const [module, methods] of [
  ['node:http', ['request', 'get']],
  ['node:https', ['request', 'get']],
  ['node:http2', ['connect']],
  ['node:net', ['connect', 'createConnection']],
  ['node:tls', ['connect']],
  ['node:dgram', ['createSocket']],
  ['node:dns', ['lookup', 'resolve', 'resolve4', 'resolve6']],
]) {
  const api = require(module)
  for (const method of methods) api[method] = deny(`${module}.${method}`)
}
require('node:net').Socket.prototype.connect = deny('Socket.connect')
syncBuiltinESMExports()
