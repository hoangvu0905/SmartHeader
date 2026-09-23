import { expandValue } from './magic.js';

export const AUTO = '@AUTO';
export const DEFAULT = '@DEFAULT';
export const DELETE = '@DELETE';
export const BLANK = '@BLANK';
export const BLOCK = '@BLOCK';

export const RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
];

export const REQUEST_METHODS = ['connect', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put'];

export const MANUAL_PRIORITY = 100000;

const MAX_COMBINED_INCLUDES = 4;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fitsUrlFilter = (text) => /^[\x20-\x7e]+$/.test(text) && !/[*^|]/.test(text);

const isCaseInsensitive = (method) => method.endsWith('_ci');

const permutations = (items) =>
  items.length <= 1
    ? [items]
    : items.flatMap((item, index) =>
        permutations(items.filter((_, other) => other !== index)).map((rest) => [item, ...rest]),
      );

function overlapLengths(first, second) {
  const lengths = [];
  for (let length = 1; length < Math.min(first.length, second.length); length++) {
    if (first.endsWith(second.slice(0, length))) lengths.push(length);
  }
  return lengths;
}

function createMatcher(method, expected) {
  switch (method) {
    case 'include':
      return (actual) => actual.includes(expected);
    case 'include_ci': {
      const lower = expected.toLowerCase();
      return (actual) => actual.toLowerCase().includes(lower);
    }
    case 'equal':
      return (actual) => actual === expected;
    case 'equal_ci': {
      const lower = expected.toLowerCase();
      return (actual) => actual.toLowerCase() === lower;
    }
    case 'regex': {
      const pattern = new RegExp(expected);
      return (actual) => pattern.test(actual);
    }
    case 'regex_ci': {
      const pattern = new RegExp(expected, 'i');
      return (actual) => pattern.test(actual);
    }
    default:
      return null;
  }
}

function singleUrlCondition({ method, expected }) {
  const isUrlFilterCaseSensitive = !isCaseInsensitive(method);
  switch (method) {
    case 'include':
    case 'include_ci':
      return fitsUrlFilter(expected)
        ? { urlFilter: expected, isUrlFilterCaseSensitive }
        : { regexFilter: escapeRegex(expected), isUrlFilterCaseSensitive };
    case 'equal':
    case 'equal_ci':
      return fitsUrlFilter(expected)
        ? { urlFilter: `|${expected}|`, isUrlFilterCaseSensitive }
        : { regexFilter: `^${escapeRegex(expected)}$`, isUrlFilterCaseSensitive };
    default:
      return { regexFilter: expected, isUrlFilterCaseSensitive };
  }
}

function combineIncludes(conditions) {
  const caseSensitive = conditions.every(({ method }) => method === 'include');
  const caseInsensitive = conditions.every(({ method }) => method === 'include_ci');
  if (!caseSensitive && !caseInsensitive) return null;

  const normalize = (text) => (caseInsensitive ? text.toLowerCase() : text);
  const distinct = [...new Set(conditions.map(({ expected }) => normalize(expected)))];
  const pieces = distinct.filter((piece) => !distinct.some((other) => other !== piece && other.includes(piece)));

  if (pieces.length === 1) {
    return singleUrlCondition({ method: caseSensitive ? 'include' : 'include_ci', expected: pieces[0] });
  }
  if (pieces.length > MAX_COMBINED_INCLUDES) return null;

  let alternatives;
  if (pieces.length === 2) {
    const [a, b] = pieces;
    alternatives = [
      [a, b],
      [b, a],
    ].flatMap(([first, second]) => [
      `${escapeRegex(first)}.*${escapeRegex(second)}`,
      ...overlapLengths(first, second).map((length) => escapeRegex(first + second.slice(length))),
    ]);
  } else {
    const overlapping = pieces.some((a) => pieces.some((b) => a !== b && overlapLengths(a, b).length > 0));
    if (overlapping) return null;
    alternatives = permutations(pieces).map((order) => order.map(escapeRegex).join('.*'));
  }
  return { regexFilter: alternatives.join('|'), isUrlFilterCaseSensitive: caseSensitive };
}

function compileUrlConditions(conditions) {
  const effective = conditions.filter(({ method, expected }) => !(expected === '' && method.startsWith('include')));
  if (effective.length === 0) return { condition: {} };
  if (effective.length === 1) return { condition: singleUrlCondition(effective[0]) };

  const exact = effective.find(({ method }) => method === 'equal');
  if (exact) {
    return effective.every(({ matcher }) => matcher(exact.expected))
      ? { condition: singleUrlCondition(exact) }
      : { never: true };
  }

  if (effective.every(({ method }) => method.startsWith('include'))) {
    const combined = combineIncludes(effective);
    if (combined) return { condition: combined };
  }
  return { issue: { code: 'url_combination', condition: effective[1].index } };
}

function compileConditions(conditions) {
  let requestMethods = REQUEST_METHODS;
  let resourceTypes = RESOURCE_TYPES;
  const urlConditions = [];

  for (const [index, { where, method, value, inv }] of conditions.entries()) {
    const expected = String(value ?? '');
    if (where === 'referer') return { issue: { code: 'referer', condition: index } };
    if (where === 'url' && inv) return { issue: { code: 'url_inverted', condition: index } };

    let matcher;
    try {
      matcher = createMatcher(method, expected);
    } catch {
      return { issue: { code: 'invalid_regex', condition: index } };
    }
    if (!matcher) return { never: true };
    const test = inv ? (actual) => !matcher(actual) : matcher;

    switch (where) {
      case 'method':
        requestMethods = requestMethods.filter((name) => test(name.toUpperCase()));
        break;
      case 'type':
        resourceTypes = resourceTypes.filter((name) => test(name));
        break;
      case 'url':
        urlConditions.push({ method, expected, matcher, index });
        break;
      default:
        return { never: true };
    }
  }

  if (requestMethods.length === 0 || resourceTypes.length === 0) return { never: true };

  const url = compileUrlConditions(urlConditions);
  if (!url.condition) return url;

  return {
    condition: {
      ...url.condition,
      resourceTypes: [...resourceTypes],
      ...(requestMethods.length < REQUEST_METHODS.length && { requestMethods: [...requestMethods] }),
    },
  };
}

const setHeader = (header, value) => ({
  type: 'modifyHeaders',
  requestHeaders: [{ header, operation: 'set', value }],
});

function createAction(header, value) {
  switch (value) {
    case DELETE:
      return { type: 'modifyHeaders', requestHeaders: [{ header, operation: 'remove' }] };
    case BLOCK:
      return { type: 'block' };
    case BLANK:
      return setHeader(header, '');
    default:
      return setHeader(header, value);
  }
}

export function compileRules(headers, values = {}, { now = new Date(), random = Math.random } = {}) {
  const rules = [];
  const sources = [];
  const issues = [];
  let volatile = false;

  const emit = (source, priority, action, condition) => {
    rules.push({ id: rules.length + 1, priority, action, condition });
    sources.push(source);
  };

  const resolveValue = (value, conditions) => {
    if (value === DELETE || value === BLOCK || value === BLANK) return { value };
    const expansion = expandValue(value, { conditions, now, random });
    if (expansion.unsupported) return { issue: expansion.unsupported };
    volatile ||= expansion.volatile;
    return { value: expansion.value };
  };

  const compileManual = (header, value) => {
    if (value === DEFAULT) return;
    const source = { header: header.name, rule: null };
    const resolved = resolveValue(value, null);
    if (resolved.issue) {
      issues.push({ ...source, code: resolved.issue });
      return;
    }
    emit(source, MANUAL_PRIORITY, createAction(header.name, resolved.value), {
      resourceTypes: [...RESOURCE_TYPES],
    });
  };

  const compileAuto = (header) => {
    const shadowing = [];
    let emitted = false;
    (header.auto ?? []).forEach((autoRule, index) => {
      const source = { header: header.name, rule: index };
      const conditions = autoRule.condition ?? [];
      if (conditions.length === 0) return;

      const compiled = compileConditions(conditions);
      if (compiled.issue) {
        issues.push({ ...source, ...compiled.issue });
        return;
      }
      if (compiled.never) return;

      const value = String(autoRule.value ?? '');
      if (value === DEFAULT) {
        shadowing.push(index);
        return;
      }

      const resolved = resolveValue(value, conditions);
      if (resolved.issue) {
        issues.push({ ...source, code: resolved.issue });
        return;
      }
      if (value === BLOCK && emitted) issues.push({ ...source, code: 'block_order' });
      for (const rule of shadowing.splice(0)) issues.push({ header: header.name, rule, code: 'default_shadow' });

      emit(source, MANUAL_PRIORITY - 1 - index, createAction(header.name, resolved.value), compiled.condition);
      emitted = true;
    });
  };

  const seen = new Set();
  for (const header of headers) {
    const key = header.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const value = values[key] ?? AUTO;
    if (value === AUTO) compileAuto(header);
    else compileManual(header, value);
  }

  return { rules, sources, issues, volatile };
}
