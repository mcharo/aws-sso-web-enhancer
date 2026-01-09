#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const JS_FILE = path.join(SCRIPT_DIR, 'aws-sso-enhancer.js');
const TEMPLATE_FILE = path.join(SCRIPT_DIR, 'index.template.html');
const OUTPUT_FILE = path.join(SCRIPT_DIR, 'index.html');

console.log('Building bookmarklet...');

// Read the JS file
const jsCode = fs.readFileSync(JS_FILE, 'utf8');

// Basic minification
const minified = jsCode
  // Remove block comments
  .replace(/\/\*[\s\S]*?\*\//g, '')
  // Remove line comments (but not URLs with //)
  .replace(/(?<!:)\/\/.*$/gm, '')
  // Collapse whitespace
  .replace(/\s+/g, ' ')
  // Remove space around operators/punctuation
  .replace(/\s*([{}()\[\];,:<>=!&|?+\-*\/])\s*/g, '$1')
  // Clean up any double spaces left
  .replace(/  +/g, ' ')
  .trim();

// URL encode
const encoded = encodeURIComponent(minified);

// Build bookmarklet (standard)
const bookmarklet = `javascript:${encoded}`;

// Build auto-expand version
const autoExpandCode = minified.replace(
  /console\.log\('AWS SSO Enhancer ready![^']*'\);/,
  `console.log('AWS SSO Enhancer ready! ☁️');setTimeout(()=>{const btn=document.querySelector('#sse-expand-all');if(btn)btn.click();},500);`
);
const autoExpandEncoded = encodeURIComponent(autoExpandCode);
const bookmarkletAutoExpand = `javascript:${autoExpandEncoded}`;

console.log(`Minified: ${jsCode.length} → ${minified.length} bytes`);
console.log(`Bookmarklet size: ${bookmarklet.length} bytes`);
console.log(`Auto-expand bookmarklet size: ${bookmarkletAutoExpand.length} bytes`);

if (bookmarklet.length > 65536) {
  console.warn('⚠️  Warning: Bookmarklet is very large. Some browsers may not support it.');
}

// Read template and replace placeholders
const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
const output = template
  .replace('@@BOOKMARKLET_CODE@@', bookmarklet)
  .replace('@@BOOKMARKLET_CODE_AUTOEXPAND@@', bookmarkletAutoExpand);

// Write output
fs.writeFileSync(OUTPUT_FILE, output);

console.log(`✓ Generated ${OUTPUT_FILE}`);

// Also generate userscript with inlined code
const userscriptTemplate = `// ==UserScript==
// @name         AWS SSO Enhancer
// @namespace    https://github.com/mcharo/aws-sso-web-enhancer
// @version      1.0.0
// @description  Filter, favorite, and enhance the AWS SSO account selection page
// @author       mcharo
// @match        https://*.awsapps.com/start*
// @match        https://*.aws.amazon.com/start*
// @icon         data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>☁️</text></svg>
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) { resolve(element); return; }
            const observer = new MutationObserver((mutations, obs) => {
                const el = document.querySelector(selector);
                if (el) { obs.disconnect(); resolve(el); }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { observer.disconnect(); reject(new Error('Timeout')); }, timeout);
        });
    }

    async function init() {
        try {
            await waitForElement('header[class*="awsui_top-navigation_"]');
            setTimeout(loadEnhancer, 500);
        } catch (e) {
            loadEnhancer();
        }
    }

    function loadEnhancer() {
        ${jsCode}
    }

    init();
})();
`;

const USERSCRIPT_FILE = path.join(SCRIPT_DIR, 'aws-sso-enhancer.user.js');
fs.writeFileSync(USERSCRIPT_FILE, userscriptTemplate);
console.log(`✓ Generated ${USERSCRIPT_FILE}`);
