import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileRules, MANUAL_PRIORITY, RESOURCE_TYPES } from '../src/lib/rules.js';

const header = (name, auto = []) => ({ name, preset: [], auto });
const rule = (value, condition) => ({ name: 'rule', desc: '', value, condition });
const cond = (where, method, value, inv = false) => ({ where, method, value, inv });

test('manual values become set, remove and block rules for every request', () => {
  const headers = [header('A'), header('B'), header('C'), header('D'), header('E')];
  const values = { a: 'fixed', b: '@DELETE', c: '@BLANK', d: '@BLOCK', e: '@DEFAULT' };
  const { rules, issues } = compileRules(headers, values);

  assert.deepEqual(issues, []);
  assert.deepEqual(
    rules.map(({ action }) => action),
    [
      { type: 'modifyHeaders', requestHeaders: [{ header: 'A', operation: 'set', value: 'fixed' }] },
      { type: 'modifyHeaders', requestHeaders: [{ header: 'B', operation: 'remove' }] },
      { type: 'modifyHeaders', requestHeaders: [{ header: 'C', operation: 'set', value: '' }] },
      { type: 'block' },
    ],
  );
  for (const { condition, priority } of rules) {
    assert.deepEqual(condition, { resourceTypes: RESOURCE_TYPES });
    assert.equal(priority, MANUAL_PRIORITY);
  }
  assert.deepEqual(
    rules.map(({ id }) => id),
    [1, 2, 3, 4],
  );
});

test('manual values with request variables are reported and skipped', () => {
  const { rules, issues } = compileRules([header('X-Host')], { 'x-host': '{host}' });
  assert.deepEqual(rules, []);
  assert.deepEqual(issues, [{ header: 'X-Host', rule: null, code: 'request_variable' }]);
});

test('auto rules keep list order through priorities', () => {
  const headers = [
    header('UA', [rule('first', [cond('url', 'include', 'a.com')]), rule('second', [cond('url', 'include', 'b.com')])]),
  ];
  const { rules, sources } = compileRules(headers);
  assert.deepEqual(
    rules.map(({ priority }) => priority),
    [MANUAL_PRIORITY - 1, MANUAL_PRIORITY - 2],
  );
  assert.deepEqual(sources, [
    { header: 'UA', rule: 0 },
    { header: 'UA', rule: 1 },
  ]);
});

test('auto rules without conditions never match', () => {
  const { rules, issues } = compileRules([header('UA', [rule('x', [])])]);
  assert.deepEqual(rules, []);
  assert.deepEqual(issues, []);
});

test('duplicate header names only compile the first one', () => {
  const headers = [header('UA'), header('ua')];
  const { rules } = compileRules(headers, { ua: 'x' });
  assert.equal(rules.length, 1);
  assert.equal(rules[0].action.requestHeaders[0].header, 'UA');
});

test('single url conditions map to url filters or regex filters', () => {
  const compile = (method, value) =>
    compileRules([header('H', [rule('v', [cond('url', method, value)])])]).rules[0].condition;

  assert.deepEqual(compile('include', 'a.com'), {
    urlFilter: 'a.com',
    isUrlFilterCaseSensitive: true,
    resourceTypes: RESOURCE_TYPES,
  });
  assert.deepEqual(compile('include_ci', 'a.com'), {
    urlFilter: 'a.com',
    isUrlFilterCaseSensitive: false,
    resourceTypes: RESOURCE_TYPES,
  });
  assert.deepEqual(compile('equal', 'https://a.com/'), {
    urlFilter: '|https://a.com/|',
    isUrlFilterCaseSensitive: true,
    resourceTypes: RESOURCE_TYPES,
  });
  assert.deepEqual(compile('include', 'a*b'), {
    regexFilter: 'a\\*b',
    isUrlFilterCaseSensitive: true,
    resourceTypes: RESOURCE_TYPES,
  });
  assert.deepEqual(compile('regex_ci', '^https?://x'), {
    regexFilter: '^https?://x',
    isUrlFilterCaseSensitive: false,
    resourceTypes: RESOURCE_TYPES,
  });
});

test('several include conditions are merged into one regex', () => {
  const headers = [
    header('UA', [rule('v', [cond('url', 'include_ci', 'example.com'), cond('url', 'include_ci', 'SmartHeader')])]),
  ];
  const { condition } = compileRules(headers).rules[0];
  assert.equal(condition.regexFilter, 'example\\.com.*smartheader|smartheader.*example\\.com');
  assert.equal(condition.isUrlFilterCaseSensitive, false);
});

test('overlapping include conditions keep the overlapped forms', () => {
  const headers = [header('H', [rule('v', [cond('url', 'include', 'ab'), cond('url', 'include', 'bc')])])];
  const pattern = new RegExp(compileRules(headers).rules[0].condition.regexFilter);
  assert.ok(pattern.test('xabcx'));
  assert.ok(pattern.test('bc-ab'));
  assert.ok(!pattern.test('ab'));
});

test('an equal condition is checked against the other url conditions', () => {
  const matching = [header('H', [rule('v', [cond('url', 'equal', 'http://a/b'), cond('url', 'include', 'a/')])])];
  assert.equal(compileRules(matching).rules[0].condition.urlFilter, '|http://a/b|');

  const conflicting = [header('H', [rule('v', [cond('url', 'equal', 'http://a/b'), cond('url', 'include', 'zz')])])];
  assert.deepEqual(compileRules(conflicting).rules, []);
});

test('method and type conditions are evaluated against every known value', () => {
  const headers = [
    header('H', [
      rule('v', [cond('method', 'equal_ci', 'post', true), cond('type', 'regex', 'frame'), cond('method', 'include', 'P')]),
    ]),
  ];
  const { condition } = compileRules(headers).rules[0];
  assert.deepEqual(condition.requestMethods, ['options', 'patch', 'put']);
  assert.deepEqual(condition.resourceTypes, ['main_frame', 'sub_frame']);
});

test('conditions that can never match drop the rule', () => {
  const headers = [header('H', [rule('v', [cond('method', 'equal', 'NOPE')])])];
  assert.deepEqual(compileRules(headers).rules, []);
});

test('unsupported conditions are reported with their index', () => {
  const headers = [
    header('H', [
      rule('v', [cond('url', 'include', 'a'), cond('referer', 'include', 'b')]),
      rule('v', [cond('url', 'include', 'a', true)]),
      rule('v', [cond('url', 'regex', 'a'), cond('url', 'regex', 'b')]),
      rule('v', [cond('type', 'regex', '(')]),
    ]),
  ];
  const { rules, issues } = compileRules(headers);
  assert.deepEqual(rules, []);
  assert.deepEqual(issues, [
    { header: 'H', rule: 0, code: 'referer', condition: 1 },
    { header: 'H', rule: 1, code: 'url_inverted', condition: 0 },
    { header: 'H', rule: 2, code: 'url_combination', condition: 1 },
    { header: 'H', rule: 3, code: 'invalid_regex', condition: 0 },
  ]);
});

test('a browser default rule above other rules is reported', () => {
  const headers = [
    header('H', [rule('@DEFAULT', [cond('url', 'include', 'a')]), rule('v', [cond('url', 'include', 'b')])]),
  ];
  const { rules, issues } = compileRules(headers);
  assert.equal(rules.length, 1);
  assert.deepEqual(issues, [{ header: 'H', rule: 0, code: 'default_shadow' }]);
});

test('a block rule below another rule is reported', () => {
  const headers = [
    header('H', [rule('v', [cond('url', 'include', 'a')]), rule('@BLOCK', [cond('url', 'include', 'b')])]),
  ];
  const { rules, issues } = compileRules(headers);
  assert.deepEqual(rules[1].action, { type: 'block' });
  assert.deepEqual(issues, [{ header: 'H', rule: 1, code: 'block_order' }]);
});

test('date and rand values mark the rule set as volatile', () => {
  const headers = [header('H')];
  const result = compileRules(headers, { h: 'v{rand:5-5}' });
  assert.equal(result.volatile, true);
  assert.equal(result.rules[0].action.requestHeaders[0].value, 'v5');
  assert.equal(compileRules(headers, { h: 'plain' }).volatile, false);
});
