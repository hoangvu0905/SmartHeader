import { $, addOption, animate, selectOption, sendMessage, translate } from './uniscript.js';

const leadingValues = [
  { name: translate('Automatic'), value: '@AUTO' },
  { name: translate('BrowserDefault'), value: '@DEFAULT' },
];

const trailingValues = [
  { name: translate('Remove'), value: '@DELETE' },
  { name: translate('Blank'), value: '@BLANK' },
];

const currentValues = {};
const selects = new Map();

async function updateHeader(header, value) {
  if (currentValues[header] === value) return;
  currentValues[header] = value;
  const response = await sendMessage({ method: 'change', which: header, value });
  animate(selects.get(header), response?.result ? 'ani_success' : 'ani_fail');
}

function addSystemOptions(select, values) {
  for (const { name, value } of values) addOption(select, name, value).className = 'opt_sys';
}

function addHeader(header, presets, value) {
  const row = document.createElement('tr');
  const title = document.createElement('th');
  const cell = document.createElement('td');
  const select = document.createElement('select');
  const editButton = document.createElement('img');

  title.textContent = header;
  Object.assign(editButton, { alt: translate('InputValue'), title: translate('InputValue'), src: 'images/pen.png' });
  editButton.className = 'edtbtn';
  cell.append(select, editButton);
  row.append(title, cell);
  $('poptbody').append(row);
  selects.set(header, select);

  addSystemOptions(select, leadingValues);
  for (const preset of presets) addOption(select, preset.name, preset.value);
  addSystemOptions(select, trailingValues);
  if (value && selectOption(select, value) === -1) addOption(select, value, value).selected = true;

  select.addEventListener('change', () => updateHeader(header, select.value));
  editButton.addEventListener('click', () => {
    const input = prompt(translate('InputValue'), select.value);
    if (input !== null && selectOption(select, input) === -1) addOption(select, input, input).selected = true;
    updateHeader(header, select.value);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const { data } = await sendMessage({ method: 'pull', source: 'popup' });
  $('poptbody').innerHTML = '';
  for (const [header, { preset, value }] of Object.entries(data)) {
    addHeader(header, preset, value);
    currentValues[header] = value;
  }
});
