# AWS SSO Enhancer ☁️

A bookmarklet that replaces the AWS SSO portal interface with a compact, filterable view.

## Install

1. Open `index.html` in your browser
2. Drag the **☁️ SSO Enhancer** button to your bookmarks bar
3. Click the bookmarklet when on your AWS SSO portal (`*.awsapps.com/start`)

Check **Auto-expand accounts on load** for a version that automatically expands all accounts.

## Features

- **Filter** by account name/ID or role name
- **Favorites** — star accounts, roles, or specific account+role combos
- **Quick Access** panel with Favorites, Recent, and Frequent sections
- **Compact UI** — see more accounts at a glance
- **Adaptive expansion** — expands accounts with rate-limit handling

## Build

```bash
node build.js
```

Generates `index.html` (bookmarklet installer).
