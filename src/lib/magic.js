const tokenPattern = /{([^}]+)}/g;
const randPattern = /^rand:(\d+)\D+(\d+)$/;
const datePattern = /^date:(.+)$/;
const resultPattern = /^result:(\d+)\D+(\d+)$/;
const requestTokens = new Set(['url', 'scheme', 'host', 'port', 'uri', 'path', 'query']);

export function formatDate(date, format) {
  const parts = {
    'M+': date.getMonth() + 1,
    'd+': date.getDate(),
    'h+': date.getHours(),
    'm+': date.getMinutes(),
    's+': date.getSeconds(),
    'q+': Math.floor((date.getMonth() + 3) / 3),
    S: date.getMilliseconds(),
  };
  let output = format.replace(/y+/, (match) => String(date.getFullYear()).slice(4 - match.length));
  for (const [pattern, value] of Object.entries(parts)) {
    output = output.replace(new RegExp(pattern), (match) =>
      match.length === 1 ? String(value) : `00${value}`.slice(String(value).length),
    );
  }
  return output;
}

const capturesRequest = ({ method, inv }) => !inv && (method === 'regex' || method === 'regex_ci');

export function expandValue(template, { conditions = null, now = new Date(), random = Math.random } = {}) {
  let volatile = false;
  let unsupported = null;
  const value = template.replace(tokenPattern, (match, token) => {
    if (requestTokens.has(token)) {
      unsupported ??= 'request_variable';
      return match;
    }
    let parts = randPattern.exec(token);
    if (parts) {
      volatile = true;
      return String(~~parts[1] + Math.round(random() * (parts[2] - parts[1])));
    }
    parts = datePattern.exec(token);
    if (parts) {
      volatile = true;
      return formatDate(now, parts[1]);
    }
    parts = conditions && resultPattern.exec(token);
    if (parts) {
      const condition = conditions[parts[1]];
      if (condition && capturesRequest(condition)) {
        unsupported ??= 'result_variable';
        return match;
      }
      return '';
    }
    return match;
  });
  return { value, volatile, unsupported };
}
