import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './csv';

test('escape koma, kutip, dan baris baru', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
});
test('cegah injeksi rumus spreadsheet', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('-5'), '-5');          // angka negatif sah
  assert.equal(csvCell('-cmd|calc'), "'-cmd|calc");
});
test('toCsv memakai BOM dan CRLF', () => {
  const out = toCsv([{ a: 1, b: 'x' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
  assert.equal(out, '﻿A,B\r\n1,x\r\n');
});
