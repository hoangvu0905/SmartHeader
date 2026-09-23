export const $ = (id) => document.getElementById(id);

export const translate = (key) => chrome.i18n.getMessage(key) || key;

export const sendMessage = (message) => chrome.runtime.sendMessage(message);

export function addOption(select, text, value) {
  const option = new Option(text, value);
  select.add(option);
  return option;
}

export const findOption = (select, value) => [...select.options].findIndex((option) => option.value == value);

export function selectOption(select, value) {
  const index = findOption(select, value);
  if (index >= 0) select.options[index].selected = true;
  return index;
}

export function translateAll() {
  document.title = translate(document.title);
  for (const span of document.querySelectorAll('span[tid]')) span.innerHTML = translate(span.getAttribute('tid'));
  for (const input of document.querySelectorAll('input[tid_v]')) input.value = translate(input.getAttribute('tid_v'));
  for (const input of document.querySelectorAll('input[tid_p]')) {
    input.placeholder = translate(input.getAttribute('tid_p'));
  }
}

export function animate(element, className) {
  for (const name of [...element.classList]) {
    if (name.startsWith('ani_')) element.classList.remove(name);
  }
  setTimeout(() => element.classList.add(className), 50);
}

export class Tabs {
  constructor(list) {
    this.list = list;
    this.current = 0;
    list.forEach(({ tab }, index) => tab.addEventListener('click', () => this.click(index)));
    this.update();
  }

  update() {
    this.list.forEach(({ tab, content }, index) => {
      const active = index === this.current;
      tab.classList.toggle('current', active);
      content.style.display = active ? 'inherit' : 'none';
    });
  }

  click(index) {
    this.current = index;
    this.update();
  }
}

let messager = null;
let messagerTimer = 0;

function dismissAlert() {
  clearTimeout(messagerTimer);
  Object.assign(messager.style, { top: '-2em', height: '1px', width: '1px' });
  messagerTimer = 0;
  messager.innerHTML = '';
}

export function showAlert(message) {
  if (!messager) {
    messager = document.createElement('div');
    messager.id = 'unicute_messager';
    messager.addEventListener('click', dismissAlert);
    messager.addEventListener('mouseover', () => clearTimeout(messagerTimer));
    document.body.append(messager);
  }
  clearTimeout(messagerTimer);
  messager.innerHTML += `<p>${message}</p>`;
  Object.assign(messager.style, { top: '0px', height: 'auto', width: 'auto' });
  messagerTimer = setTimeout(dismissAlert, 3000 + 80 * message.length);
  messager.style.height = `${messager.offsetHeight}px`;
  messager.style.width = `${messager.offsetWidth}px`;
}

window.addEventListener('load', translateAll);
