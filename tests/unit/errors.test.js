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
