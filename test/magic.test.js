import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandValue, formatDate } from '../src/lib/magic.js';

const now = new Date(2026, 8, 3, 7, 5, 9, 45);

test('formatDate pads two-letter tokens and keeps single-letter tokens raw', () => {
  assert.equal(formatDate(now, 'yyyy-MM-dd hh:mm:ss'), '2026-09-03 07:05:09');
  assert.equal(formatDate(now, 'yy/M/d q'), '26/9/3 3');
});

test('expandValue leaves plain text and unknown tokens untouched', () => {
  assert.deepEqual(expandValue('abc {unknown}'), { value: 'abc {unknown}', volatile: false, unsupported: null });
});

test('expandValue evaluates date and rand as volatile values', () => {
  const result = expandValue('{date:yyyyMMdd}-{rand:10-20}', { now, random: () => 0.5 });
  assert.deepEqual(result, { value: '20260903-15', volatile: true, unsupported: null });
});

test('expandValue flags request dependent variables', () => {
  assert.equal(expandValue('id={host}').unsupported, 'request_variable');
});

test('expandValue keeps result tokens literal without conditions', () => {
  assert.equal(expandValue('{result:0:1}').value, '{result:0:1}');
});

test('expandValue resolves result tokens of non capturing conditions to empty', () => {
  const conditions = [{ where: 'url', method: 'include', value: 'a', inv: false }];
  assert.deepEqual(expandValue('x{result:0:1}y', { conditions }), { value: 'xy', volatile: false, unsupported: null });
});

test('expandValue flags result tokens of regex conditions', () => {
  const conditions = [{ where: 'url', method: 'regex', value: '(a)', inv: false }];
  assert.equal(expandValue('{result:0:1}', { conditions }).unsupported, 'result_variable');
});
