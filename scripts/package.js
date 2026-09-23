import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('src/manifest.json', 'utf8'));
const output = `dist/smart-header-${version}.zip`;

mkdirSync('dist', { recursive: true });
execFileSync('git', ['archive', '--format=zip', `--output=${output}`, 'HEAD:src']);
console.log(output);
