import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeChrome } from './fake-chrome.js';

let chrome;
let instance = 0;

const send = (message) => chrome.sendMessage(message);
const rules = () => chrome.declarativeNetRequest.getDynamicRules();
const manualRuleOf = async (header) =>
  (await rules()).find(({ priority, action }) => priority === 100000 && action.requestHeaders?.[0].header === header);

beforeEach(async () => {
  chrome = createFakeChrome();
  globalThis.chrome = chrome;
  await import(`../src/background.js?instance=${++instance}`);
  await chrome.runtime.onInstalled.dispatch({ reason: 'install' });
});

test('install seeds the default headers, applies their auto rules and opens the about page', async () => {
  const { headers, config } = await send({ method: 'pull', source: 'config' });
  assert.deepEqual(
    headers.map(({ name }) => name),
    ['User-Agent', 'Accept-Language'],
  );
  assert.deepEqual(config, { sync: true, keepvalue: false });

  const [rule] = await rules();
  assert.equal(rule.condition.urlFilter, 'github.com/hoangvu0905/smartheader');
  assert.equal(rule.condition.isUrlFilterCaseSensitive, false);
  assert.equal(rule.action.requestHeaders[0].value, 'Mozilla/5.0 (compatible; SmartHeader/2.0.0)');
  assert.deepEqual(chrome.tabs.created, [{ url: 'chrome-extension://smart-header/about.html' }]);
  assert.ok(chrome.storage.sync.data.headers);
});

test('popup pull lists every header with its current value and presets', async () => {
  const { data } = await send({ method: 'pull', source: 'popup' });
  assert.deepEqual(Object.keys(data), ['User-Agent', 'Accept-Language']);
  assert.equal(data['User-Agent'].value, '@AUTO');
  assert.equal(data['User-Agent'].preset.length, 5);
});

test('changing a value from the popup replaces the rules for that header', async () => {
  assert.deepEqual(await send({ method: 'change', which: 'User-Agent', value: 'Custom' }), {
    result: true,
    which: 'User-Agent',
  });
  const all = await rules();
  assert.equal(all.length, 1);
  assert.deepEqual(all[0].action.requestHeaders, [{ header: 'User-Agent', operation: 'set', value: 'Custom' }]);

  await send({ method: 'change', which: 'User-Agent', value: '@DEFAULT' });
  assert.deepEqual(await rules(), []);
});

test('a manual value that needs the request is refused', async () => {
  const response = await send({ method: 'change', which: 'Accept-Language', value: '{host}' });
  assert.equal(response.result, false);
  assert.equal(await manualRuleOf('Accept-Language'), undefined);
});

test('saving headers reports unsupported rules and keeps them for the config page', async () => {
  const { headers } = await send({ method: 'pull', source: 'config' });
  headers.push({
    name: 'X-Test',
    preset: [],
    auto: [{ name: 'r', desc: '', value: 'v', condition: [{ where: 'referer', method: 'include', value: 'a', inv: false }] }],
  });
  const response = await send({ method: 'push', data: headers });
  assert.equal(response.result, true);
  assert.deepEqual(response.issues, [{ header: 'X-Test', rule: 0, code: 'referer', condition: 0 }]);

  const { issues } = await send({ method: 'pull', source: 'config' });
  assert.deepEqual(issues, response.issues);
  const { data } = await send({ method: 'pull', source: 'popup' });
  assert.equal(data['X-Test'].value, '@AUTO');
});

test('values reset after a browser restart unless keep value is on', async () => {
  await send({ method: 'change', which: 'Accept-Language', value: 'fr' });
  await chrome.storage.session.clear();
  await chrome.runtime.onStartup.dispatch();
  assert.equal(await manualRuleOf('Accept-Language'), undefined);

  await send({ method: 'updatecfg', config: { sync: true, keepvalue: true } });
  await send({ method: 'change', which: 'Accept-Language', value: 'fr' });
  await chrome.storage.session.clear();
  await chrome.runtime.onStartup.dispatch();
  const { data } = await send({ method: 'pull', source: 'popup' });
  assert.equal(data['Accept-Language'].value, 'fr');
  assert.ok(await manualRuleOf('Accept-Language'));
});

test('date and rand values schedule a refresh alarm that is cleared when no longer needed', async () => {
  await send({ method: 'change', which: 'Accept-Language', value: '{date:yyyy}' });
  assert.equal(chrome.alarms.all.get('refresh-rules').periodInMinutes, 0.5);
  assert.equal((await manualRuleOf('Accept-Language')).action.requestHeaders[0].value, String(new Date().getFullYear()));

  await send({ method: 'change', which: 'Accept-Language', value: 'plain' });
  assert.equal(chrome.alarms.all.has('refresh-rules'), false);
});

test('sync writes within a minute are buffered and flushed by an alarm', async () => {
  await send({ method: 'updatecfg', config: { sync: true, keepvalue: true } });
  await send({ method: 'change', which: 'Accept-Language', value: 'de' });
  assert.equal(chrome.storage.sync.data.headers_value, undefined);
  assert.ok(chrome.alarms.all.has('flush-sync'));

  await chrome.alarms.onAlarm.dispatch({ name: 'flush-sync' });
  await send({ method: 'pull', source: 'config' });
  assert.equal(chrome.storage.sync.data.headers_value['accept-language'], 'de');
});

test('sync writes are skipped when sync is off', async () => {
  await chrome.storage.sync.clear();
  await send({ method: 'updatecfg', config: { sync: false, keepvalue: false } });
  const { headers } = await send({ method: 'pull', source: 'config' });
  await send({ method: 'push', data: headers });
  assert.deepEqual(chrome.storage.sync.data, {});
});

test('factory reset clears storage, rules and alarms then reloads', async () => {
  await send({ method: 'change', which: 'Accept-Language', value: '{rand:1-9}' });
  await send({ method: 'factoryreset' });
  assert.deepEqual(await rules(), []);
  assert.equal(chrome.alarms.all.size, 0);
  assert.deepEqual(chrome.storage.local.data, {});
  assert.equal(chrome.runtime.reloads, 1);
});
