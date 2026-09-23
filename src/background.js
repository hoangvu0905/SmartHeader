import { applyRules, clearRules } from './lib/apply.js';
import { clearAll, loadState, normalizeValues, saveConfig, saveValues, store } from './lib/state.js';

let queue = Promise.resolve();

const serialize = (task) => {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
};

async function refresh() {
  const { headers, values } = await loadState();
  return applyRules(headers, values);
}

const isManualIssueOf = (key) => (issue) => issue.rule === null && issue.header.toLowerCase() === key;

const handlers = {
  async pull({ source }) {
    const { config, headers, values } = await loadState();
    if (source === 'config') return { result: true, headers, config };
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
    const { issues } = await applyRules(headers, nextValues);
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
    const { issues } = await applyRules(headers, values);
    return { result: !issues.some(isManualIssueOf(key)), which };
  },

  async factoryreset() {
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
