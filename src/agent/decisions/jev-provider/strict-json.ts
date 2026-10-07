/** Bounded JSON parser rejecting duplicate decoded keys before JSON.parse can erase them. */
export function parseStrictJson(text: string): unknown {
  let i = 0
  const fail = (): never => {
    throw new Error('invalid-json')
  }
  const ws = () => {
    while (/[\x20\t\r\n]/.test(text[i] ?? 'x')) i++
  }
  function string(): string {
    if (text[i++] !== '"') return fail()
    const start = i - 1
    while (i < text.length) {
      const c = text[i++]
      if (c === '\\') {
        i++
        continue
      }
      if (c === '"') {
        try {
          return JSON.parse(text.slice(start, i))
        } catch {
          return fail()
        }
      }
    }
    return fail()
  }
  function value(depth: number): void {
    if (depth > 64) fail()
    ws()
    const c = text[i]
    if (c === '"') {
      string()
      return
    }
    if (c === '{') {
      i++
      ws()
      const keys = new Set<string>()
      if (text[i] === '}') {
        i++
        return
      }
      while (i < text.length) {
        ws()
        const key = string()
        if (keys.has(key)) throw new Error('duplicate-json-key')
        keys.add(key)
        ws()
        if (text[i++] !== ':') fail()
        value(depth + 1)
        ws()
        if (text[i] === '}') {
          i++
          return
        }
        if (text[i++] !== ',') fail()
      }
      fail()
    }
    if (c === '[') {
      i++
      ws()
      if (text[i] === ']') {
        i++
        return
      }
      while (i < text.length) {
        value(depth + 1)
        ws()
        if (text[i] === ']') {
          i++
          return
        }
        if (text[i++] !== ',') fail()
      }
      fail()
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
      text.slice(i),
    )
    if (!token) fail()
    i += token![0].length
  }
  value(0)
  ws()
  if (i !== text.length) fail()
  try {
    return JSON.parse(text)
  } catch {
    return fail()
  }
}
