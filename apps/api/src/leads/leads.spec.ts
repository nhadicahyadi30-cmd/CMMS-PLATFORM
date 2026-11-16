import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LeadDto, RateLimiter, oneLine } from './leads.rules';

test('lead valid dan default', () => {
  const d = LeadDto.parse({ name: ' Budi ', company: 'PT Uji' });
  assert.equal(d.name, 'Budi'); assert.equal(d.phone, ''); assert.equal(d.website, '');
});
test('lead menolak nama/perusahaan kosong dan email salah', () => {
  assert.equal(LeadDto.safeParse({ name: '', company: 'x' }).success, false);
  assert.equal(LeadDto.safeParse({ name: 'a', company: '' }).success, false);
  assert.equal(LeadDto.safeParse({ name: 'a', company: 'b', email: 'bukan-email' }).success, false);
  assert.equal(LeadDto.safeParse({ name: 'a', company: 'b', email: 'a@b.id' }).success, true);
});
test('rate limiter: maks 3 per jendela, lalu pulih', () => {
  const r = new RateLimiter(3, 1000);
  assert.ok(r.allow('ip', 0) && r.allow('ip', 1) && r.allow('ip', 2));
  assert.equal(r.allow('ip', 3), false);
  assert.ok(r.allow('lain', 3));
  assert.ok(r.allow('ip', 1100));
});
test('oneLine membuang baris baru', () => { assert.equal(oneLine('a\r\nBcc: x'), 'a Bcc: x'); });
