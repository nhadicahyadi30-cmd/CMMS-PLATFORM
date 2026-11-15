import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './admin.controller';

test('normalisasi nomor telepon ke E.164', () => {
  assert.equal(normalizePhone('0812-3456-7890'), '+6281234567890');
  assert.equal(normalizePhone('6281234567890'), '+6281234567890');
  assert.equal(normalizePhone('+62 812 3456 7890'), '+6281234567890');
});
