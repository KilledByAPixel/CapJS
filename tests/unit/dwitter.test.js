import { test, expect } from 'vitest'
import { compress, uncompress, isCompressed, minify, beautify, countChars, countBytes } from '../../src/code/dwitter.js'
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
test('beautify breaks after top-level ; but leaves for heads, calls and strings alone', () => {
  expect(beautify('for(i=9;i--;)x.fillRect(i,0,9,9);c.width|=0')).toBe('for(i=9;i--;)\nx.fillRect(i,0,9,9);\nc.width|=0')
  expect(beautify('a=1;b="x;y";c=`p;${q;r}`;d=2 // e;f')).toBe('a=1;\nb="x;y";\nc=`p;${q;r}`;\nd=2 // e;f')
})
test('beautify puts blocks on indented lines', () => {
  expect(beautify('if(t){a=1;b=2}c=3')).toBe('if(t){\n  a=1;\n  b=2\n}\nc=3')
  expect(beautify('if(a){b()}else{c()}')).toBe('if(a){\n  b()\n}else{\n  c()\n}')
  expect(beautify('f=x=>{return x};g={}')).toBe('f=x=>{\n  return x\n};\ng={}')
  expect(beautify('if(t){if(u){v()}}')).toBe('if(t){\n  if(u){\n    v()\n  }\n}')
})
test('beautify breaks after for/while/with/if heads that have a brace-less body', () => {
  const dweet = 'with(x)for(w=c.width|=i=10;i--;)for(j=99;j--;fillRect((u=300*(i+t%1))-2940+j*6,u/2-j*2,w,150))fillStyle=`hsl(${i&&210} 99% ${99-j}%`'
  expect(beautify(dweet)).toBe('with(x)\nfor(w=c.width|=i=10;i--;)\nfor(j=99;j--;fillRect((u=300*(i+t%1))-2940+j*6,u/2-j*2,w,150))\nfillStyle=`hsl(${i&&210} 99% ${99-j}%`')
  expect(beautify('if(a)b();c()')).toBe('if(a)\nb();\nc()')
  expect(beautify('for(;;){x()}')).toBe('for(;;){\n  x()\n}')
  expect(beautify('o.if(1)+x.while(2)')).toBe('o.if(1)+x.while(2)')
  expect(beautify('while(i--);')).toBe('while(i--);')
})
test('beautify leaves formatted code alone, adds no trailing blank line, uncompresses first', () => {
  expect(beautify('a=1;\nb=2')).toBe('a=1;\nb=2')
  expect(beautify('a=1; b=2;')).toBe('a=1;\nb=2;')
  expect(beautify(compress('a=1;b=2'))).toBe('a=1;\nb=2;')
})
test('counts', () => {
  expect(countChars('a█')).toBe(2)
  expect(countBytes('a█')).toBe(4)
})
test('compress leaves already-compressed code alone', () => {
  const once = compress(prog)
  expect(compress(once)).toBe(once)
  expect(compress('// note\n' + once)).toBe('// note\n' + once)
})
