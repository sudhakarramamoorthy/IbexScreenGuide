/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "2ac998bcfe3b363b482df52f7f4892f9"
  }, {
    "url": "pwa-512x512.png",
    "revision": "cb8dac2e13868f476c354e205c347c24"
  }, {
    "url": "pwa-192x192.png",
    "revision": "6cd0430c6af8c3d0da3fd6767aa20fe3"
  }, {
    "url": "index.html",
    "revision": "d6bff6043eb28c18a8ec9f5e4d91b317"
  }, {
    "url": "icon.svg",
    "revision": "4a03a0a1eaeefb0f54c0b24dc0f89cf1"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "9c6916ea3a061e75db36a1b0a80e257e"
  }, {
    "url": "src/assets/images/projector_ust_laser_1795409895474.jpg",
    "revision": "df25116120b6df76726952b700fdd047"
  }, {
    "url": "src/assets/images/projector_portable_led_1795409894504.jpg",
    "revision": "58fc57af90fd9b0077d22e65cd30a734"
  }, {
    "url": "src/assets/images/projector_gaming_short_1795409894536.jpg",
    "revision": "8bc6f30fd522f6074dfb1be3099931c9"
  }, {
    "url": "src/assets/images/projector_cinema_4k_1795409893518.jpg",
    "revision": "24602b109d86a4390e3c9e87dbfe2a54"
  }, {
    "url": "src/assets/images/app_icon_mark_1795409894734.jpg",
    "revision": "779803d552e03bbabe81e99f1725f871"
  }, {
    "url": "assets/workbox-window.prod.es5-Bd17z0YL.js",
    "revision": null
  }, {
    "url": "assets/index-CDQT4Wgt.js",
    "revision": null
  }, {
    "url": "assets/index-BUh8mthE.css",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "9c6916ea3a061e75db36a1b0a80e257e"
  }, {
    "url": "icon.svg",
    "revision": "4a03a0a1eaeefb0f54c0b24dc0f89cf1"
  }, {
    "url": "pwa-192x192.png",
    "revision": "6cd0430c6af8c3d0da3fd6767aa20fe3"
  }, {
    "url": "pwa-512x512.png",
    "revision": "cb8dac2e13868f476c354e205c347c24"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "2ac998bcfe3b363b482df52f7f4892f9"
  }, {
    "url": "manifest.webmanifest",
    "revision": "038c1a319273e4185321e9644c306ee1"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
