import { test, expect } from 'vitest'
import { wrapLoops, wrapHtmlScripts } from '../../src/code/loopProtect.js'
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
test('unmatched loop-like text in a comment does not disable later protection', () => {
  expect(() => run(wrapLoops('// see while (\nfor(;;);'), 1e5)).toThrow('Loop timed out')
})
test('loop-like text in strings and comments is not rewritten', () => {
  const code = 'a="while(1)";b=\'for(;;)\';/* while(x) */'
  expect(wrapLoops(code)).toBe(code)
})
test('a loop nested in a for head yields valid JS with both loops guarded', () => {
  const out = wrapLoops('for(i=0;i<(()=>{while(x);return 1})();i++);')
  expect(() => new Function('__lg', out)).not.toThrow()
  expect(out.match(/__lg\(\)/g).length).toBe(2)
  expect(run(wrapLoops('let n=0;for(let i=0;i<(()=>{let k=0;while(k<2)k++;return 3})();i++)n++;return n'), 1e5)).toBe(3)
})
test('html: inline JS script bodies are wrapped; src, non-JS types and markup are not', () => {
  const html = '<p>for(;;) while(1)</p>\n<script>for(;;);</script>\n<SCRIPT type="module">\nwhile(1){}\n</SCRIPT>' +
    '<script src="a.js">for(;;);</script><script type="x-shader/x-fragment">for(int i=0;i<9;i++){}</script>'
  const out = wrapHtmlScripts(html)
  expect(out).toBe('<p>for(;;) while(1)</p>\n<script>for(;;__lg());</script>\n<SCRIPT type="module">\nwhile(__lg(),1){}\n</SCRIPT>' +
    '<script src="a.js">for(;;);</script><script type="x-shader/x-fragment">for(int i=0;i<9;i++){}</script>')
  expect(out.split('\n').length).toBe(html.split('\n').length)
  expect(wrapHtmlScripts('<script type="text/javascript">for(;;){}</script>')).toBe('<script type="text/javascript">for(;;__lg()){}</script>')
})
