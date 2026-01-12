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
  // Remove space around operators/punctuation (preserve space after } for template literals)
  .replace(/\s*([{()\[\];,:<>=!&|?+\-*\/])\s*/g, '$1')
  .replace(/\s*}/g, '}')
  .replace(/}\s+(?=[a-zA-Z$_])/g, '} ')
  // Clean up any double spaces left
  .replace(/  +/g, ' ')
  .trim();

// Helper to create variant
function createVariant(code, { autoExpand = false, hideHeaders = false } = {}) {
  let result = code;
  
  if (hideHeaders) {
    result = result.replace('const HIDE_HEADERS=false', 'const HIDE_HEADERS=true');
  }
  
  if (autoExpand) {
    result = result.replace(
      /console\.log\('AWS SSO Enhancer ready![^']*'\);/,
      `console.log('AWS SSO Enhancer ready! ☁️');setTimeout(()=>{const btn=document.querySelector('#sse-expand-all');if(btn)btn.click();},500);`
    );
  }
  
  return `javascript:${encodeURIComponent(result)}`;
}

// Build all 4 variants
const variants = {
  standard: createVariant(minified),
  autoExpand: createVariant(minified, { autoExpand: true }),
  hideHeaders: createVariant(minified, { hideHeaders: true }),
  autoExpandHideHeaders: createVariant(minified, { autoExpand: true, hideHeaders: true }),
};

console.log(`Minified: ${jsCode.length} → ${minified.length} bytes`);
console.log(`Standard bookmarklet: ${variants.standard.length} bytes`);
console.log(`Auto-expand bookmarklet: ${variants.autoExpand.length} bytes`);
console.log(`Hide-headers bookmarklet: ${variants.hideHeaders.length} bytes`);
console.log(`Auto-expand + hide-headers: ${variants.autoExpandHideHeaders.length} bytes`);

if (variants.standard.length > 65536) {
  console.warn('⚠️  Warning: Bookmarklet is very large. Some browsers may not support it.');
}

// Read template and replace placeholders
const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
const output = template
  .replace('@@BOOKMARKLET_STANDARD@@', variants.standard)
  .replace('@@BOOKMARKLET_AUTOEXPAND@@', variants.autoExpand)
  .replace('@@BOOKMARKLET_HIDEHEADERS@@', variants.hideHeaders)
  .replace('@@BOOKMARKLET_AUTOEXPAND_HIDEHEADERS@@', variants.autoExpandHideHeaders);

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
