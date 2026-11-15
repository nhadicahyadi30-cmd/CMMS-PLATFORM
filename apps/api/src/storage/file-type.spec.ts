import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniff, safeName } from './file-type';

test('deteksi dari isi berkas', () => {
  assert.equal(sniff(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))?.mime, 'image/jpeg');
  assert.equal(sniff(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))?.mime, 'image/png');
  assert.equal(sniff(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))?.mime, 'image/webp');
  assert.equal(sniff(new TextEncoder().encode('%PDF-1.7'))?.kind, 'document');
});
test('tolak berkas lain (mis. HTML/skrip berkedok gambar)', () => {
  assert.equal(sniff(new TextEncoder().encode('<html><script>alert(1)</script>')), null);
  assert.equal(sniff(new Uint8Array(0)), null);
});
test('nama berkas disanitasi', () => {
  assert.equal(safeName('../../etc/passwd', 'jpg'), 'passwd');
  assert.equal(safeName('foto "a".jpg', 'jpg'), 'foto a.jpg');
  assert.equal(safeName(undefined, 'png'), 'lampiran.png');
});
