import { test, expect } from 'vitest'
import { parseErrorLine } from '../../src/code/errors.js'
test('maps a runtime error in new Function code to the editor line', () => {
  let stack
  try { new Function('t', 'a=1\nb=2\nnope()')(0) } catch (e) { stack = e.stack }
  expect(parseErrorLine(stack)).toBe(3)
  expect(parseErrorLine('Error: x\n    at foo (app.js:10:2)')).toBeNull()
})
test('offset is a parameter; result below 1 is null', () => {
  const s = 'Error\n    at eval (eval at <anonymous> (x.js:1:1), <anonymous>:4:5)'
  expect(parseErrorLine(s, 0)).toBe(4)
  expect(parseErrorLine(s, 2)).toBe(2)
  expect(parseErrorLine(s, 4)).toBeNull()
})

import { describeError, locateSyntaxError, formatError } from '../../src/code/errors.js'
const thrown = (body, ...args) => { try { new Function('t', body)(...args) } catch (e) { return e } }

test('describeError names the error and gives editor line and column', () => {
  const e = describeError(thrown('a=1\nb=2\n  nope()'))
  expect(e).toMatchObject({ message: 'ReferenceError: nope is not defined', line: 3, column: 3 })
  expect(e.stack).toEqual([]) // one frame only: nothing extra to show
  expect(describeError(new Error('Loop timed out')).message).toBe('Loop timed out')
  expect(describeError('boom')).toMatchObject({ message: 'boom', line: null, column: null })
})
test('describeError lists the chain of user-code frames when there is more than one', () => {
  const e = describeError(thrown('function draw(){\n  nope()\n}\ndraw()'))
  expect(e).toMatchObject({ line: 2, column: 3 })
  expect(e.stack).toEqual([{ fn: 'draw', line: 2, column: 3 }, { fn: null, line: 4, column: 1 }])
})
test('explicit line and column (from window.onerror) win, and offset 0 maps eval code', () => {
  expect(describeError(new TypeError('x'), { line: 7, column: 4 })).toMatchObject({ message: 'TypeError: x', line: 7, column: 4 })
})
test('syntax errors are located by parsing the original code', () => {
  const code = 'x.fillRect(0,0,9,9)\ny=)'
  const e = describeError(thrown(code), { code })
  expect(e.message).toMatch(/^SyntaxError: /)
  expect(e).toMatchObject({ line: 2, column: 3 })
  expect(locateSyntaxError('a=(\n')).toMatchObject({ line: 2, column: 1 })
  expect(locateSyntaxError('return 1')).toBeNull() // dweet bodies may return
  expect(locateSyntaxError('x=1')).toBeNull()
})
test('formatError gives the head and the frames to show', () => {
  expect(formatError({ message: 'ReferenceError: nope is not defined', line: 2, column: 1, stack: [] })).toEqual({
    head: 'ReferenceError: nope is not defined (Line:2, Column:1)',
    frames: [],
  })
  expect(formatError({ message: 'Error: x', line: 2, column: null, stack: [{ fn: 'draw', line: 2, column: 3 }, { fn: null, line: 4, column: 1 }] }))
    .toEqual({ head: 'Error: x (Line:2)', frames: ['at draw (Line:2, Column:3)', 'at Line:4, Column:1'] })
  expect(formatError({ message: 'Loop timed out', line: null })).toMatchObject({ head: 'Loop timed out', frames: [] })
  expect(formatError(null)).toBeNull()
})
