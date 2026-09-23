export const DEFAULT_CONFIG = { sync: true, keepvalue: false };

export const createDefaultHeaders = () => [
  {
    name: 'User-Agent',
    preset: [
      {
        name: 'Samsung Galaxy S4',
        value:
          'Mozilla/5.0 (Linux; Android 4.2.2; GT-I9505 Build/JDQ39) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.59 Mobile Safari/537.36',
      },
      {
        name: 'iPhone 6',
        value:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1',
      },
      { name: 'IE6', value: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; FSL 7.0.6.01001)' },
      { name: 'Googlebot 2.1', value: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      {
        name: 'Baidu Spider(PC)',
        value: 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
      },
    ],
    auto: [
      {
        name: chrome.i18n.getMessage('ar_test_title'),
        desc: 'Just a test',
        value: `Mozilla/5.0 (compatible; SmartHeader/${chrome.runtime.getManifest().version})`,
        condition: [
          { inv: false, method: 'include_ci', value: 'laobubu.net', where: 'url' },
          { inv: false, method: 'include_ci', value: 'smartheader', where: 'url' },
        ],
      },
    ],
  },
  {
    name: 'Accept-Language',
    preset: [
      { name: 'English(US)', value: 'en-US,en;q=0.5' },
      { name: 'Chinese(Simplified)', value: 'zh-CN,zh;q=0.8' },
    ],
    auto: [],
  },
];
