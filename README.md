# SmartHeader

Manifest V3 browser extension that modifies HTTP request headers from a popup, with presets and automatic rules.

Author: Nguyễn Hoàng Vũ - https://github.com/hoangvu0905/SmartHeader

## Layout

| Path | Content |
| --- | --- |
| `src/` | The extension (load this folder in the browser) |
| `src/background.js` | Service worker: message protocol, storage, rule updates |
| `src/lib/rules.js` | Compiles headers, values and auto rules into `declarativeNetRequest` rules |
| `src/lib/magic.js` | Magic variables (`{date:...}`, `{rand:a-b}`, ...) |
| `src/lib/state.js` | Config, headers and values in `chrome.storage`, throttled sync |
| `test/` | Unit tests for the compiler and integration tests for the service worker |

## Install for development

1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on Developer mode.
3. Click "Load unpacked" and select the `src` folder.

## Scripts

Requires Node.js 22 or later, no dependencies.

```sh
npm test          # run all tests
npm run package   # zip src/ at HEAD into dist/smart-header-<version>.zip for the store
```

## Release

The `Build` GitHub Action runs the tests and uploads the store zip as an artifact on every push and pull request. To publish a release:

1. Bump `version` in `src/manifest.json` (and `package.json`) and commit.
2. Tag the commit with the same version and push the tag:

   ```sh
   git tag v2.0.0
   git push origin v2.0.0
   ```

3. The action checks that the tag matches the manifest version, then creates a GitHub release with `smart-header-<version>.zip` attached, ready to upload to the Chrome Web Store or Edge Add-ons.

## Magic variables

Values of presets, manual values and auto rules can contain these variables:

| Variable | Result |
| --- | --- |
| `{date:format}` | Current date and time. `yyyy` year, `MM` month, `dd` day, `hh` hour, `mm` minute, `ss` second, `q` quarter, `S` millisecond |
| `{rand:min-max}` | Random integer between `min` and `max` |
| `{result:i:j}` | Group `j` of the RegExp match of condition number `i` in the same auto rule (not supported in MV3) |
| `{url}`, `{scheme}`, `{host}`, `{port}`, `{uri}`, `{path}`, `{query}` | Parts of the request URL (not supported in MV3) |

The condition number is shown when hovering a condition in the configuration page.

## Differences from the MV2 version

MV3 no longer lets extensions rewrite headers per request from JavaScript (`webRequestBlocking`). Headers are changed through `declarativeNetRequest` rules, which are static. What this means:

| Feature | Status |
| --- | --- |
| Fixed values, Remove, Blank, Block, Browser's default value | Supported |
| Auto rule order (first matching rule wins) | Supported through rule priorities |
| `Method` and `Req Type` conditions, including RegExp and NOT | Supported |
| One `URL` condition, or several `Include` URL conditions | Supported |
| `{date:...}` and `{rand:a-b}` | Recomputed every 30 seconds instead of for each request |
| `Referer` conditions | Not supported |
| NOT on a `URL` condition, several RegExp URL conditions | Not supported |
| `{url}`, `{scheme}`, `{host}`, `{port}`, `{uri}`, `{path}`, `{query}`, `{result:i:j}` | Not supported |
| A "Browser's default value" auto rule stopping the rules below it | Not supported, the rules below still apply |
| A "Stop!(Block)" auto rule below another matching rule | Blocks anyway |

Auto rules that cannot be applied are highlighted in the configuration page with the reason. A manual value from the popup that cannot be applied shows the red failure animation.

## Manual test checklist

- Popup lists User-Agent and Accept-Language; picking a preset flashes green and the header changes on the next request (check with https://httpbin.org/headers).
- Remove, Blank and a value typed with the pen button work; `{host}` flashes red.
- Configure: add, rename, delete a header; edit presets; add, sort, delete auto rules and conditions; Save shows "Changes are saved".
- An auto rule with a Referer condition is highlighted with its reason.
- Options: sync and keep-value toggles, Apply, raw Load / Write / Mix, factory reset, wipe cloud.
- With keep-value off, values go back to Automatic after restarting the browser; with it on, they are kept.
- About page shows the version and opens on first install.
