import { $, Tabs, addOption, animate, selectOption, sendMessage, showAlert, translate } from './uniscript.js';
import { compileRules } from './lib/rules.js';

const headerNameData = [
  'Accept',
  'Accept-Charset',
  'Accept-Encoding',
  'Accept-Language',
  'Accept-Datetime',
  'Cookie',
  'Content-MD5',
  'Content-Type',
  'Date',
  'Expect',
  'Forwarded',
  'From',
  'Max-Forwards',
  'Origin',
  'Range',
  'Referer',
  'TE',
  'User-Agent',
  'Upgrade',
  'Via',
  'Warning',
  'X-Requested-With',
  'DNT',
  'X-Forwarded-For',
  'X-Forwarded-Host',
  'X-Forwarded-Proto',
  'Front-End-Https',
  'X-Http-Method-Override',
  'X-ATT-DeviceId',
  'X-Wap-Profile',
  'X-UIDH',
  'X-Csrf-Token',
].sort();

const validHeaderName = /^[a-zA-Z_][\w-]*$/;

const whereOptions = [
  ['w_url', 'url'],
  ['w_referer', 'referer'],
  ['w_method', 'method'],
  ['w_type', 'type'],
];

const methodOptions = [
  ['m_include', 'include'],
  ['m_include_ci', 'include_ci'],
  ['m_equal', 'equal'],
  ['m_equal_ci', 'equal_ci'],
  ['m_regex', 'regex'],
  ['m_regex_ci', 'regex_ci'],
];

const newCondition = () => ({ where: 'url', method: 'include', value: '', inv: false });

const runtimeIssueCodes = new Set(['regex_unsupported', 'rejected']);

const issueMessage = ({ code }) => translate(`issue_${code}`);

let headers = [];
let currentHeader = -1;
let currentRule = { value: 0, input: null };
let ruleTool;
let ruleList;
let headerContainer;
let detailTabs;
let optionsHidden = true;
let saveNoticed = false;
let runtimeIssues = [];

const currentAutoRules = () => headers[currentHeader].auto;
const selectedAutoRule = () => currentAutoRules()[currentRule.value];

function setRuntimeIssues(issues = []) {
  runtimeIssues = issues.filter(({ code }) => runtimeIssueCodes.has(code));
}

function renderIssues() {
  const header = headers[currentHeader];
  if (!header) return;
  const issues = [...compileRules(headers).issues, ...runtimeIssues].filter(
    ({ header: name, rule }) => name === header.name && rule !== null,
  );

  [...ruleList.children].forEach((input, index) => {
    const messages = issues.filter(({ rule }) => rule === index).map(issueMessage);
    input.classList.toggle('ar_unsupported', messages.length > 0);
    input.title = messages.join('\n');
  });

  const selected = issues.filter(({ rule }) => rule === currentRule.value);
  const box = $('ar_issues');
  box.replaceChildren(
    ...[...new Set(selected.map(issueMessage))].map((message) =>
      Object.assign(document.createElement('div'), { textContent: message }),
    ),
  );
  box.style.display = selected.length > 0 ? '' : 'none';
  [...$('ar_conidition').children].forEach((item, index) => {
    item.classList.toggle('condition_unsupported', selected.some(({ condition }) => condition === index));
  });
}

function thingsChanged() {
  if (!saveNoticed) {
    saveNoticed = true;
    showAlert(translate('noticeSave'));
  }
  $('save').classList.add('save_waiting');
  renderIssues();
}

function keepingScroll(action) {
  const detail = $('cfg_headerdetail');
  const { scrollTop } = detail;
  action();
  detail.scrollTop = scrollTop;
}

function onSaveReplied(response) {
  if (response?.result) {
    $('save').classList.remove('save_waiting');
    showAlert(translate('noticeSaved'));
  } else {
    showAlert(translate('noticeSaveFailed'));
  }
  $('save').disabled = false;
}

async function save() {
  $('save').disabled = true;
  const response = await sendMessage({ method: 'push', data: headers });
  setRuntimeIssues(response?.issues);
  onSaveReplied(response);
  renderIssues();
}

async function pushConfig() {
  const config = { sync: $('c_sync').checked, keepvalue: $('c_keepvalue').checked };
  onSaveReplied(await sendMessage({ method: 'updatecfg', config }));
}

function toggleOptions() {
  optionsHidden = !optionsHidden;
  $('cfgWhole1').style.display = optionsHidden ? 'none' : '';
  $('cfgWhole2').style.display = optionsHidden ? '' : 'none';
  $('save').style.visibility = optionsHidden ? 'hidden' : '';
}

function toggleUtils() {
  const utils = $('cfg_top_utils');
  utils.style.display = utils.style.display === 'none' ? 'block' : 'none';
}

function testRegex() {
  try {
    const pattern = new RegExp($('util_pattern').value, $('util_ci').checked ? 'i' : '');
    $('util_result1').textContent = pattern.exec($('util_test').value) || '(ERR_NO_RESULT)';
  } catch {}
}

function reloadValueSuggestions() {
  const suggestions = [
    { name: translate('Remove'), value: '@DELETE' },
    { name: translate('BrowserDefault'), value: '@DEFAULT' },
    { name: translate('Blank'), value: '@BLANK' },
    { name: translate('Block'), value: '@BLOCK' },
    ...headers[currentHeader].preset,
  ];
  $('headervaluedata').replaceChildren(
    ...suggestions.map(({ name, value }) => Object.assign(document.createElement('option'), { label: name, value })),
  );
}

function selectRule(index) {
  try {
    currentRule.input?.classList.remove('current');
    const input = ruleList.children[index];
    input.classList.add('current');
    currentRule = { value: index, input };
    const list = $('autorule');
    if (list.scrollTop > input.offsetTop) {
      list.scrollTop = input.offsetTop;
    } else if (list.scrollTop + list.clientHeight < input.offsetTop + input.offsetHeight) {
      list.scrollTop = input.offsetTop + input.offsetHeight - list.clientHeight;
    }
  } catch {
    currentRule.value = null;
  }
}

function pushRule(name, index) {
  const input = document.createElement('input');
  input.value = name;
  input.addEventListener('mousemove', () => {
    ruleTool.input = input;
    ruleTool.panel.style.top = `${input.offsetTop}px`;
  });
  input.addEventListener('change', () => {
    currentAutoRules()[index].name = input.value;
    thingsChanged();
  });
  input.addEventListener('click', () => {
    selectRule(index);
    renderRuleDetails();
  });
  ruleTool.indexes.set(input, index);
  ruleList.append(input);
  return input;
}

function loadRules(rules) {
  ruleList.innerHTML = '';
  ruleTool.panel.style.top = '-100px';
  rules.forEach(({ name }, index) => pushRule(name, index));
  currentRule = { value: '', input: null };
  if (rules.length > 0) selectRule(0);
  $('aract_sort').style.display = rules.length > 1 ? '' : 'none';
}

function createSelect(name, index, options, selected) {
  const select = document.createElement('select');
  select.name = name;
  for (const [key, value] of options) addOption(select, translate(key), value);
  selectOption(select, selected);
  select.addEventListener('change', () => {
    selectedAutoRule().condition[index][name] = select.value;
    thingsChanged();
  });
  return select;
}

function createConditionButton(name, index, src, action) {
  const button = document.createElement('img');
  button.name = name;
  button.src = src;
  button.addEventListener('click', () => {
    keepingScroll(() => {
      action(selectedAutoRule().condition, index);
      renderRuleDetails();
    });
    thingsChanged();
  });
  return button;
}

function createConditionItem(condition, index) {
  const item = document.createElement('div');
  item.className = 'condition_item';

  const indexTag = document.createElement('span');
  indexTag.className = 'arcIndex';
  indexTag.innerHTML = index + translate('condNumExplain');

  const valueInput = document.createElement('input');
  valueInput.name = 'value';
  valueInput.value = condition.value;
  valueInput.addEventListener('change', () => {
    selectedAutoRule().condition[index].value = valueInput.value;
    thingsChanged();
  });

  const invert = document.createElement('input');
  Object.assign(invert, { name: 'inv', id: `inv${index}`, type: 'checkbox', checked: condition.inv });
  invert.addEventListener('change', () => {
    selectedAutoRule().condition[index].inv = invert.checked;
    thingsChanged();
  });

  const invertLabel = document.createElement('label');
  invertLabel.setAttribute('tid', 'invtag');
  invertLabel.htmlFor = invert.id;
  invertLabel.innerHTML = translate('invtag');

  item.append(
    indexTag,
    createSelect('where', index, whereOptions, condition.where),
    invert,
    invertLabel,
    createSelect('method', index, methodOptions, condition.method),
    valueInput,
    createConditionButton('del', index, 'images/delete.png', (conditions, at) => conditions.splice(at, 1)),
    createConditionButton('add', index, 'images/add.png', (conditions, at) => conditions.splice(at, 0, newCondition())),
  );
  return item;
}

function renderRuleDetails() {
  if (currentAutoRules().length === 0) {
    $('ar_condition_details').style.display = 'none';
    return;
  }
  $('ar_condition_details').style.display = '';
  const rule = selectedAutoRule();
  $('ar_value').value = rule.value;
  $('ar_conidition').replaceChildren(...rule.condition.map(createConditionItem));
  renderIssues();
}

function onHeaderRename(input, index) {
  const previous = headers[index].name;
  const name = input.value.trim();
  const lower = name.toLowerCase();
  let valid = validHeaderName.test(name);
  if (valid && headers.some((header, other) => other !== index && header.name.toLowerCase() === lower)) {
    showAlert(translate('noticeDuplicate'));
    valid = false;
  }
  if (valid) {
    animate(input, 'ani_success');
    headers[index].name = name;
    input.value = name;
    thingsChanged();
  } else {
    animate(input, 'ani_fail');
    input.value = previous;
  }
}

function onHeaderSelect(input, index) {
  if (input.classList.contains('current')) return;
  headerContainer.querySelector('input.current')?.classList.remove('current');
  input.classList.add('current');
  currentHeader = index;
  $('cfg_headerdetail').style.display = '';
  $('cfg_cover').style.display = 'none';
  $('preset_data').value = headers[index].preset.map(({ name, value }) => `${name}=${value}\n`).join('');
  reloadValueSuggestions();
  loadRules(currentAutoRules());
  renderRuleDetails();
}

function showHeaders(list) {
  headers = list;
  headerContainer.innerHTML = '';
  if (currentHeader >= headers.length) currentHeader = headers.length - 1;
  headers.forEach(({ name }, index) => {
    const input = document.createElement('input');
    headerContainer.append(input);
    input.className = 'item';
    input.value = name;
    input.setAttribute('list', 'header-name-data');
    input.addEventListener('change', () => onHeaderRename(input, index));
    input.addEventListener('click', () => onHeaderSelect(input, index));
    input.addEventListener('focus', () => onHeaderSelect(input, index));
    if (index === currentHeader) input.click();
  });
  detailTabs.click(0);
  $('cfg_headerdetail').style.display = currentHeader < 0 ? 'none' : '';
  $('cfg_cover').style.display = currentHeader >= 0 ? 'none' : '';
}

function startAddingHeader() {
  let input = document.createElement('input');
  const commit = () => {
    if (input === null) return;
    const name = input.value.trim();
    input.remove();
    input = null;
    if (!validHeaderName.test(name)) {
      showAlert(translate('noticeInvalid'));
      return;
    }
    const lower = name.toLowerCase();
    const existing = headers.findIndex((header) => header.name.toLowerCase() === lower);
    if (existing >= 0) {
      showAlert(translate('noticeDuplicate'));
      headerContainer.children[existing].click();
      return;
    }
    headers.push({ name, preset: [], auto: [] });
    currentHeader = headers.length - 1;
    showHeaders(headers);
    thingsChanged();
  };
  headerContainer.append(input);
  input.className = 'item';
  input.setAttribute('list', 'header-name-data');
  input.focus();
  input.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') commit();
  });
  input.addEventListener('blur', commit);
}

function parsePresets(text) {
  const presets = [];
  for (const line of text.split('\n')) {
    const content = line.replace(/[\r\n]/g, '');
    const separator = content.indexOf('=');
    if (separator > 0) {
      presets.push({ name: content.slice(0, separator), value: content.slice(separator + 1) });
    } else {
      const value = line.trim();
      if (value.length) presets.push({ name: value.slice(0, 10), value });
    }
  }
  return presets;
}

function mixHeaders(imported) {
  const added = [];
  let presetCount = 0;
  let ruleCount = 0;
  for (const header of imported) {
    const target = headers.find(({ name }) => name == header.name);
    if (!target) {
      headers.push(header);
      added.push(header.name);
      continue;
    }
    for (const preset of header.preset) {
      if (!target.preset.some(({ value }) => value == preset.value)) {
        target.preset.push(preset);
        presetCount++;
      }
    }
    for (const rule of header.auto) {
      if (!target.auto.some(({ name }) => name == rule.name)) {
        target.auto.push(rule);
        ruleCount++;
      }
    }
  }
  alert(`== Mix Result ==\n\n${added.join(', ')}\n\n${presetCount} preset(s)\n${ruleCount} autorule(s)\n`);
}

function sortRules() {
  if (!confirm(translate('ARSortWarning'))) return;
  const rules = currentAutoRules();
  const selected = rules[currentRule.value];
  const sorted = rules
    .map((rule, index) => ({ rule, key: `${rule.name}+${index}` }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ rule }) => rule);
  headers[currentHeader].auto = sorted;
  loadRules(sorted);
  selectRule(Math.max(0, sorted.indexOf(selected)));
  renderRuleDetails();
  thingsChanged();
}

function addRule() {
  const rules = currentAutoRules();
  const index = rules.length;
  const name = 'NewRule';
  rules.push({ name, desc: '', value: '@DEFAULT', condition: [] });
  pushRule(name, index).focus();
  selectRule(index);
  $('aract_sort').style.display = rules.length > 1 ? '' : 'none';
  renderRuleDetails();
  thingsChanged();
}

function deleteHoveredRule() {
  try {
    const rules = currentAutoRules();
    let index = ruleTool.indexes.get(ruleTool.input);
    if (index === undefined) throw new Error('No rule hovered');
    rules.splice(index, 1);
    loadRules(rules);
    if (index >= rules.length) index = rules.length - 1;
    selectRule(index);
    renderRuleDetails();
    thingsChanged();
  } catch {
    animate(ruleTool.del, 'ani_fail');
  }
}

function bind(id, event, handler) {
  $(id).addEventListener(event, handler);
}

document.addEventListener('DOMContentLoaded', async () => {
  $('header-name-data').replaceChildren(
    ...headerNameData.map((value) => Object.assign(document.createElement('option'), { value })),
  );
  headerContainer = $('header_container');
  detailTabs = new Tabs([
    { tab: $('tab1'), content: $('presets') },
    { tab: $('tab2'), content: $('autorules') },
  ]);
  new Tabs([{ tab: $('util1'), content: $('util1c') }]);

  ruleTool = { panel: $('artool'), del: $('ardel'), input: null, indexes: new WeakMap() };
  ruleList = $('arlist');
  ruleTool.del.title = translate('delete');

  bind('save', 'click', save);
  bind('btnDelHeader', 'click', () => {
    headers.splice(currentHeader, 1);
    showHeaders(headers);
    thingsChanged();
  });
  bind('btnAddHeader', 'click', startAddingHeader);
  bind('preset_data', 'change', (event) => {
    headers[currentHeader].preset = parsePresets(event.target.value);
    thingsChanged();
    reloadValueSuggestions();
  });
  bind('ar_value', 'change', (event) => {
    selectedAutoRule().value = event.target.value;
    thingsChanged();
  });
  bind('btnAddARCond', 'click', () => {
    keepingScroll(() => {
      selectedAutoRule().condition.push(newCondition());
      renderRuleDetails();
    });
    thingsChanged();
  });

  for (const id of ['util_pattern', 'util_test']) {
    bind(id, 'change', testRegex);
    bind(id, 'keyup', testRegex);
  }
  bind('util_ci', 'change', testRegex);
  bind('utilHide', 'click', toggleUtils);
  bind('cfgUtils', 'click', toggleUtils);
  bind('cfgOptions', 'click', toggleOptions);
  bind('cfgHelp', 'click', () => window.open('about.html'));
  bind('cBack', 'click', toggleOptions);
  bind('cSave', 'click', pushConfig);
  bind('c_factoryreset', 'click', () => {
    if (!confirm(translate('c_factoryreset_msg'))) return;
    sendMessage({ method: 'factoryreset' });
    window.close();
  });
  bind('c_wipecloud', 'click', () => {
    if (confirm(translate('c_wipecloud_msg'))) chrome.storage.sync.clear();
  });

  bind('rawload', 'click', () => {
    $('rawdata').value = JSON.stringify(headers);
  });
  bind('rawwrite', 'click', () => {
    showHeaders(JSON.parse($('rawdata').value));
    toggleOptions();
    thingsChanged();
  });
  bind('rawmix', 'click', () => {
    mixHeaders(JSON.parse($('rawdata').value));
    showHeaders(headers);
    toggleOptions();
    thingsChanged();
  });

  bind('aract_add', 'click', addRule);
  bind('aract_sort', 'click', sortRules);
  ruleTool.del.addEventListener('click', deleteHoveredRule);
  bind('autorule', 'mouseout', () => {
    setTimeout(() => {
      const list = $('autorule');
      if (list.offsetHeight < 100 && currentRule.input) list.scrollTop = currentRule.input.offsetTop;
    }, 420);
  });

  toggleUtils();
  toggleOptions();

  const { headers: loaded, config, issues } = await sendMessage({ method: 'pull', source: 'config' });
  setRuntimeIssues(issues);
  showHeaders(loaded);
  $('c_sync').checked = config.sync;
  $('c_keepvalue').checked = config.keepvalue;
});

window.addEventListener(
  'beforeunload',
  (event) => {
    if (!$('save').classList.contains('save_waiting')) return;
    animate($('save'), 'ani_shake');
    event.preventDefault();
    event.returnValue = translate('confirmDiscardData');
  },
  true,
);
