import { compileRules } from './rules.js';

async function filterUnsupportedRegex(rules, sources, issues) {
  const kept = [];
  for (const [index, rule] of rules.entries()) {
    const { regexFilter, isUrlFilterCaseSensitive } = rule.condition;
    if (regexFilter) {
      const { isSupported } = await chrome.declarativeNetRequest.isRegexSupported({
        regex: regexFilter,
        isCaseSensitive: isUrlFilterCaseSensitive,
      });
      if (!isSupported) {
        issues.push({ ...sources[index], code: 'regex_unsupported' });
        continue;
      }
    }
    kept.push({ rule, source: sources[index] });
  }
  return kept.map(({ rule, source }, index) => ({ rule: { ...rule, id: index + 1 }, source }));
}

async function replaceRules(entries, issues) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map(({ id }) => id);
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: entries.map(({ rule }) => rule) });
    return;
  } catch (error) {
    console.warn('Smart Header: rule set rejected, retrying rule by rule', error);
  }
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
  for (const { rule, source } of entries) {
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
    } catch (error) {
      console.warn('Smart Header: rule rejected', rule, error);
      issues.push({ ...source, code: 'rejected' });
    }
  }
}

export async function applyRules(headers, values) {
  const { rules, sources, issues, volatile } = compileRules(headers, values);
  const entries = await filterUnsupportedRegex(rules, sources, issues);
  await replaceRules(entries, issues);
  return { issues, volatile };
}

export async function clearRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map(({ id }) => id) });
}
