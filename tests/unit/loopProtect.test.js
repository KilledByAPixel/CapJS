import { test, expect } from 'vitest'
import { wrapLoops } from '../../src/code/loopProtect.js'
const run = (code, limit) => { let n = 0; const __lg = () => { if (++n > limit) throw Error('Loop timed out') }; return new Function('__lg', code)(__lg) }
test('infinite loops of each kind throw', () => {
  for (const code of ['for(;;){}', 'for(i=0;i<9;i--);', 'while(1)x=1', 'do{}while(true)', 'for(i=0;;)i++'])
    expect(() => run(wrapLoops(code), 1e5), code).toThrow('Loop timed out')
})
test('finite loops still compute the same result', () => {
  expect(run(wrapLoops('let s=0;for(let i=0;i<10;i++)s+=i;return s'), 1e5)).toBe(45)
  expect(run(wrapLoops('let s=0,i=5;while(i--)s++;return s'), 1e5)).toBe(5)
})
test('for-of / for-in are left alone', () => {
  expect(wrapLoops('for(const a of b);for(k in o);')).toBe('for(const a of b);for(k in o);')
})
test('never adds newlines and handles nested parens', () => {
  const code = 'for(i=f(1);i<g(2);i+=h(3))\n{x=(1)}\nwhile(\n(a))b'
  const out = wrapLoops(code)
  expect(out.split('\n').length).toBe(code.split('\n').length)
  expect(out).toContain('i+=h(3)')
  expect(out.match(/__lg\(\)/g).length).toBe(2)
})
test('a for-of does not swallow a following real loop', () => {
  expect(wrapLoops('for(a of b);for(;;);')).toBe('for(a of b);for(;;__lg());')
})
test('custom guard', () => {
  expect(wrapLoops('while(1);', 'G()')).toBe('while(G(),1);')
})
