const clone = (value) => (value === undefined ? undefined : structuredClone(value));

function createEvent() {
  const listeners = [];
  return {
    listeners,
    addListener: (listener) => listeners.push(listener),
    dispatch: (...args) => Promise.all(listeners.map((listener) => listener(...args))),
  };
}

function createStorageArea() {
  let data = {};
  return {
    get data() {
      return data;
    },
    async get(keys) {
      if (keys === undefined || keys === null) return clone(data);
      const list = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(list.filter((key) => key in data).map((key) => [key, clone(data[key])]));
    },
    async set(items) {
      data = { ...data, ...clone(items) };
    },
    async remove(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete data[key];
    },
    async clear() {
      data = {};
    },
  };
}

export function createFakeChrome() {
  let dynamicRules = [];
  const alarms = new Map();
  const tabs = [];
  let reloads = 0;

  const chrome = {
    tabs: {
      created: tabs,
      create: async (options) => tabs.push(options),
    },
    i18n: { getMessage: (key) => key },
    runtime: {
      id: 'smart-header',
      onMessage: createEvent(),
      onInstalled: createEvent(),
      onStartup: createEvent(),
      OnInstalledReason: { INSTALL: 'install', UPDATE: 'update' },
      getURL: (path) => `chrome-extension://smart-header/${path}`,
      getManifest: () => ({ version: '2.0.0' }),
      reload: () => reloads++,
      get reloads() {
        return reloads;
      },
    },
    storage: {
      local: createStorageArea(),
      sync: createStorageArea(),
      session: createStorageArea(),
    },
    declarativeNetRequest: {
      getDynamicRules: async () => clone(dynamicRules),
      isRegexSupported: async () => ({ isSupported: true }),
      async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
        const remaining = dynamicRules.filter(({ id }) => !removeRuleIds.includes(id));
        const ids = new Set(remaining.map(({ id }) => id));
        for (const rule of addRules) {
          if (ids.has(rule.id)) throw new Error(`Duplicate rule id ${rule.id}`);
          ids.add(rule.id);
        }
        dynamicRules = [...remaining, ...clone(addRules)];
      },
    },
    alarms: {
      onAlarm: createEvent(),
      all: alarms,
      create: async (name, info) => alarms.set(name, { name, ...info }),
      get: async (name) => alarms.get(name),
      clear: async (name) => alarms.delete(name),
      clearAll: async () => alarms.clear(),
    },
  };

  chrome.sendMessage = (message) =>
    new Promise((resolve) => {
      const keepOpen = chrome.runtime.onMessage.listeners.some((listener) =>
        listener(message, { id: chrome.runtime.id }, resolve),
      );
      if (!keepOpen) resolve(undefined);
    });

  return chrome;
}
