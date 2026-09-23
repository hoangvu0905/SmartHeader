import { applyRules, clearRules } from './lib/apply.js';
import {
  SYNC_ALARM,
  clearAll,
  flushPendingSync,
  loadState,
  normalizeValues,
  saveConfig,
  saveValues,
  store,
} from './lib/state.js';

const REFRESH_ALARM = 'refresh-rules';

let queue = Promise.resolve();

const serialize = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

async function apply(headers, values) {
  const outcome = await applyRules(headers, values);
  await chrome.storage.session.set({ rule_issues: outcome.issues });
  if (!outcome.volatile) await chrome.alarms.clear(REFRESH_ALARM);
  else if (!(await chrome.alarms.get(REFRESH_ALARM))) {
    await chrome.alarms.create(REFRESH_ALARM, { periodInMinutes: 0.5 });
  }
  return outcome;
}

async function refresh() {
  const { headers, values } = await loadState();
  return apply(headers, values);
}

const isManualIssueOf = (key) => (issue) => issue.rule === null && issue.header.toLowerCase() === key;

const handlers = {
  async pull({ source }) {
    const { config, headers, values } = await loadState();
    if (source === 'config') {
      const { rule_issues: issues = [] } = await chrome.storage.session.get('rule_issues');
      return { result: true, headers, config, issues };
    }
    if (source === 'popup') {
      const data = {};
      for (const [key, value] of Object.entries(values)) {
        const header = headers.find(({ name }) => name.toLowerCase() === key);
        data[header.name] = { value, preset: header.preset };
      }
      return { result: true, data };
    }
    return { result: false };
  },

  async push({ data: headers }) {
    const { config, values } = await loadState();
    const nextValues = normalizeValues(headers, values);
    await store({ headers }, config);
    await saveValues(nextValues, config);
    const { issues } = await apply(headers, nextValues);
    return { result: true, issues };
  },

  async updatecfg({ config }) {
    const { headers, values } = await loadState();
    await saveConfig(config);
    await store({ headers, headers_value: config.keepvalue ? values : {} }, config);
    return { result: true };
  },

  async change({ which, value }) {
    const { config, headers, values } = await loadState();
    const key = which.toLowerCase();
    values[key] = value;
    await saveValues(values, config);
    const { issues } = await apply(headers, values);
    return { result: !issues.some(isManualIssueOf(key)), which };
  },

  async factoryreset() {
    await chrome.alarms.clearAll();
    await clearRules();
    await clearAll();
    chrome.runtime.reload();
    return { result: true };
  },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[message.method];
  if (!handler) {
    sendResponse({ result: false });
    return false;
  }
  serialize(() => handler(message)).then(sendResponse, (error) => {
    console.error('Smart Header:', message.method, error);
    sendResponse({ result: false });
  });
  return true;
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await serialize(refresh);
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('about.html') });
  }
});

chrome.runtime.onStartup.addListener(() => serialize(refresh));

chrome.alarms.onAlarm.addListener(({ name }) => {
  if (name === REFRESH_ALARM) serialize(refresh);
  if (name === SYNC_ALARM) serialize(flushPendingSync);
});
