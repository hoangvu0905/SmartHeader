import { AUTO } from './rules.js';
import { DEFAULT_CONFIG, createDefaultHeaders } from './defaults.js';

export const SYNC_ALARM = 'flush-sync';
const SYNC_INTERVAL = 60000;

async function flush(items) {
  await chrome.storage.session.set({ sync_last: Date.now() });
  await chrome.storage.session.remove('sync_pending');
  try {
    await chrome.storage.sync.set(items);
  } catch (error) {
    console.warn('Smart Header: sync storage rejected the write', error);
  }
}

async function writeSync(items) {
  const { sync_pending: pending = {}, sync_last: last = 0 } = await chrome.storage.session.get([
    'sync_pending',
    'sync_last',
  ]);
  const merged = { ...pending, ...items };
  if (Date.now() - last >= SYNC_INTERVAL) {
    await flush(merged);
    return;
  }
  await chrome.storage.session.set({ sync_pending: merged });
  await chrome.alarms.create(SYNC_ALARM, { when: last + SYNC_INTERVAL });
}

export async function flushPendingSync() {
  const { sync_pending: pending } = await chrome.storage.session.get('sync_pending');
  if (!pending) return;
  const config = await loadConfig();
  if (config.sync) await flush(pending);
  else await chrome.storage.session.remove('sync_pending');
}

export async function store(items, config) {
  await chrome.storage.local.set(items);
  if (config.sync) await writeSync(items);
}

export async function loadConfig() {
  const { config } = await chrome.storage.local.get('config');
  return { ...DEFAULT_CONFIG, ...config };
}

export async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

export async function loadHeaders(config) {
  const { headers } = await chrome.storage.local.get('headers');
  if (headers) return headers;

  let initial = createDefaultHeaders();
  if (config.sync) {
    const synced = await chrome.storage.sync.get('headers').catch(() => ({}));
    if (synced.headers) initial = synced.headers;
  }
  await store({ headers: initial }, config);
  return initial;
}

export function normalizeValues(headers, stored = {}) {
  const values = {};
  for (const { name } of headers) {
    const key = name.toLowerCase();
    if (!(key in values)) values[key] = stored[key] ?? AUTO;
  }
  return values;
}

export async function loadValues(headers, config) {
  const { headers_value: current } = await chrome.storage.session.get('headers_value');
  if (current) return normalizeValues(headers, current);
  if (config.keepvalue) {
    const { headers_value: kept } = await chrome.storage.local.get('headers_value');
    return normalizeValues(headers, kept);
  }
  return normalizeValues(headers);
}

export async function saveValues(values, config) {
  await chrome.storage.session.set({ headers_value: values });
  if (config.keepvalue) await store({ headers_value: values }, config);
}

export async function loadState() {
  const config = await loadConfig();
  const headers = await loadHeaders(config);
  const values = await loadValues(headers, config);
  return { config, headers, values };
}

export async function clearAll() {
  await Promise.all([chrome.storage.local.clear(), chrome.storage.sync.clear(), chrome.storage.session.clear()]);
}
