import { $ } from './uniscript.js';

document.addEventListener('DOMContentLoaded', () => {
  $('ver').textContent = chrome.runtime.getManifest().version;
});
