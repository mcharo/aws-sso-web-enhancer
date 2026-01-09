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

// Build bookmarklet
const bookmarklet = `javascript:${encoded}`;

console.log(`Minified: ${jsCode.length} → ${minified.length} bytes`);
console.log(`Bookmarklet size: ${bookmarklet.length} bytes`);

if (bookmarklet.length > 65536) {
  console.warn('⚠️  Warning: Bookmarklet is very large. Some browsers may not support it.');
}

// Read template and replace placeholder
const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
const output = template.replace('@@BOOKMARKLET_CODE@@', bookmarklet);

// Write output
fs.writeFileSync(OUTPUT_FILE, output);

console.log(`✓ Generated ${OUTPUT_FILE}`);
