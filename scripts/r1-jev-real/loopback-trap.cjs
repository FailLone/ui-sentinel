// Free verification only: block external Node connections while allowing the isolated HTTP test.
const net = require('node:net')
const tls = require('node:tls')
const http = require('node:http')
const https = require('node:https')
const allowed = new Set(['127.0.0.1', '::1', '[::1]', 'localhost'])
function check(args) {
  let target = args[0]
  if (Array.isArray(target)) target = target[0]
  if (typeof target === 'string' && /^https?:/.test(target)) {
    if (!allowed.has(new URL(target).hostname)) throw Error('external-network-forbidden')
    return
  }
  if (target instanceof URL) {
    if (!allowed.has(target.hostname)) throw Error('external-network-forbidden')
    return
  }
  const host =
    target && typeof target === 'object'
      ? target.hostname || target.host
      : typeof args[1] === 'string'
        ? args[1]
        : 'localhost'
  if (host && !allowed.has(host)) throw Error('external-network-forbidden')
}
for (const [owner, key] of [
  [net, 'connect'],
  [net, 'createConnection'],
  [tls, 'connect'],
  [http, 'request'],
  [http, 'get'],
  [https, 'request'],
  [https, 'get'],
]) {
  const original = owner[key]
  owner[key] = function (...args) {
    check(args)
    return Reflect.apply(original, this, args)
  }
}
const connect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  check(args)
  return Reflect.apply(connect, this, args)
}
const originalFetch = globalThis.fetch
globalThis.fetch = function (url, ...rest) {
  check([url instanceof Request ? url.url : url])
  return originalFetch.call(this, url, ...rest)
}
