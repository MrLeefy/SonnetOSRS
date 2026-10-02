'use strict';
// Keep the Chromium sandbox enabled. If this renderer cannot create a WebGL
// context under the host's security policy, fail instead of weakening it.
module.exports = {
  headless: true,
  chromiumSandbox: true,
  ignoreDefaultArgs: [
    '--enable-unsafe-swiftshader',
    '--unsafely-disable-devtools-self-xss-warnings',
  ],
};
