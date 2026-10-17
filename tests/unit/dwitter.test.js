import { test, expect } from 'vitest'
import { compress, uncompress, isCompressed, minify, countChars, countBytes } from '../../src/code/dwitter.js'
const prog = 'c.width|=0\nfor(i=1e3;i--;)\nx.fillRect(960+900*S(i*2),540+500*C(t*PI/2+i*3),29,29)'

test('compress round-trips (odd length is padded with ;)', () => {
  const c = compress(prog)
  expect(c.startsWith('eval(unescape(escape`')).toBe(true)
  expect(countChars(c)).toBe(84)
  expect(uncompress(c)).toBe(prog + ';')
  expect(uncompress(compress('ab;c'))).toBe('ab;c')
  expect(uncompress(compress('abc'))).toBe('abc;')
})
test('compress escapes characters above 255 as \\uXXXX', () => {
  expect(uncompress(compress('s="█"'))).toBe('s="\\u2588"')
})
test('uncompress keeps text before and after, passes plain code through', () => {
  expect(uncompress('// hi\n' + compress('ab'))).toBe('// hi\nab')
  expect(uncompress(compress('ab') + '\n//x')).toBe('ab\n//x')
  expect(uncompress('x.fillRect(0,0,9,9)')).toBe('x.fillRect(0,0,9,9)')
  expect(isCompressed(compress('ab'))).toBe(true)
  expect(isCompressed('ab')).toBe(false)
})
test('minify is conservative: trims lines, drops blank lines and whole-line // comments', () => {
  expect(minify('  a = 1\n\n  // note\n  s = "a  b" // keep\n')).toBe('a = 1\ns = "a  b" // keep')
})
test('counts', () => {
  expect(countChars('a█')).toBe(2)
  expect(countBytes('a█')).toBe(4)
})
