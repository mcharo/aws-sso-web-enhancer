// AWS SSO Enhancer - Complete UI Replacement
// Compact, filterable, favorites-first interface

(function() {
  'use strict';

  if (window.__awsSsoEnhancer) {
    console.log('AWS SSO Enhancer already running');
    return;
  }

  // ========== OPTIONS (modified by build) ==========
  const HIDE_HEADERS = false;

  // ========== STATE ==========
  const STORAGE_KEY = 'awsSsoEnhancer_v2';
  const USAGE_KEY = 'awsSsoEnhancer_usage';
  let state = {
    favoriteAccounts: new Set(),
    favoriteRoles: new Set(),
    favoriteCombos: new Set(),
    accountFilter: '',
    roleFilter: '',
    showFavoritesOnly: false,
    accounts: [],
    isLoading: false,
    loadingProgress: { current: 0, total: 0 },
    currentDelay: 100,
    consecutiveErrors: 0
  };
  // Usage tracking: { "accountId:roleName": { count, lastUsed, accountName, roleName, consoleUrl } }
  let usageData = {};
  let isRendering = false;
  let renderQueued = false;

  // Load saved state
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.favoriteAccounts = new Set(saved.favoriteAccounts || []);
      state.favoriteRoles = new Set(saved.favoriteRoles || []);
      state.favoriteCombos = new Set(saved.favoriteCombos || []);
    } catch (e) {}
    try {
      usageData = JSON.parse(localStorage.getItem(USAGE_KEY) || '{}');
    } catch (e) { usageData = {}; }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      favoriteAccounts: [...state.favoriteAccounts],
      favoriteRoles: [...state.favoriteRoles],
      favoriteCombos: [...state.favoriteCombos]
    }));
  }

  function trackUsage(accountId, accountName, roleName, consoleUrl) {
    const key = `${accountId}:${roleName}`;
    const existing = usageData[key] || { count: 0 };
    usageData[key] = {
      count: existing.count + 1,
      lastUsed: Date.now(),
      accountId,
      accountName,
      roleName,
      consoleUrl
    };
    localStorage.setItem(USAGE_KEY, JSON.stringify(usageData));
  }

  function getRecentlyUsed(limit = 5) {
    return Object.values(usageData)
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, limit);
  }

  function getFrequentlyUsed(limit = 5) {
    return Object.values(usageData)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // ========== DOM HELPERS ==========
  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return [...ctx.querySelectorAll(sel)]; }

  // ========== ACCOUNT DATA EXTRACTION ==========
  function getAccountButtons() {
    return $$('button[data-testid="account-list-cell"]');
  }

  function parseAccountButton(btn) {
    const nameEl = $('strong span', btn);
    const spans = $$('p span', btn);
    let id = '', name = nameEl?.textContent?.trim() || '', email = '';
    spans.forEach(s => {
      const t = s.textContent.trim();
      if (/^\d{12}$/.test(t)) id = t;
      else if (t.includes('@')) email = t;
    });
    return { id, name, email, element: btn, expanded: btn.getAttribute('aria-expanded') === 'true' };
  }

  function getAccountRoles(btn) {
    const container = btn.closest('.UQDbz64f0aRBYmzupdOU') || btn.closest('[class*="cevwRopJqwHgUyz"]') || btn.parentElement;
    const roleContainer = container?.querySelector('[data-testid="role-list-container"]');
    if (!roleContainer) return [];
    return $$('[data-testid="role-list-item"]', roleContainer).map(item => {
      const link = $('[data-testid="federation-link"]', item);
      const keysLink = $('[data-testid="role-creation-action-button"]', item);
      return {
        name: link?.textContent?.trim() || '',
        consoleUrl: link?.getAttribute('href') || '',
        element: item,
        keysElement: keysLink
      };
    });
  }

  // ========== SMART EXPANSION WITH BACKOFF ==========
  async function expandAccount(btn) {
    if (btn.getAttribute('aria-expanded') === 'true') return true;
    
    btn.click();
    
    // Wait for roles to appear or timeout
    const startTime = Date.now();
    const maxWait = 5000;
    
    while (Date.now() - startTime < maxWait) {
      await sleep(50);
      const roles = getAccountRoles(btn);
      if (roles.length > 0) {
        state.consecutiveErrors = 0;
        state.currentDelay = Math.max(50, state.currentDelay - 10);
        return true;
      }
      // Check if still loading (look for spinner or loading state)
      if (btn.getAttribute('aria-expanded') === 'true') {
        // Expanded but no roles yet - might be rate limited or loading
        await sleep(100);
      }
    }
    
    // Timeout - likely rate limited
    state.consecutiveErrors++;
    state.currentDelay = Math.min(5000, state.currentDelay * 2);
    return false;
  }

  async function expandAllAccounts(onProgress) {
    if (state.isLoading) return;
    state.isLoading = true;
    state.currentDelay = 100;
    state.consecutiveErrors = 0;
    
    const buttons = getAccountButtons();
    const toExpand = buttons.filter(b => b.getAttribute('aria-expanded') === 'false');
    state.loadingProgress = { current: 0, total: toExpand.length };
    
    for (let i = 0; i < toExpand.length; i++) {
      const btn = toExpand[i];
      const success = await expandAccount(btn);
      
      state.loadingProgress.current = i + 1;
      if (onProgress) onProgress(state.loadingProgress);
      
      // Adaptive delay
      if (!success) {
        // Failed - back off significantly
        await sleep(state.currentDelay);
      } else if (state.consecutiveErrors > 0) {
        // Recovering from errors
        await sleep(state.currentDelay);
      } else {
        // Going well - minimal delay
        await sleep(Math.max(30, state.currentDelay));
      }
      
      // If too many consecutive errors, pause longer
      if (state.consecutiveErrors >= 3) {
        await sleep(3000);
        state.consecutiveErrors = 0;
      }
    }
    
    state.isLoading = false;
    refreshAccountData();
    render();
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  // ========== FAVORITES ==========
  function toggleFavoriteAccount(accountId) {
    if (state.favoriteAccounts.has(accountId)) {
      state.favoriteAccounts.delete(accountId);
    } else {
      state.favoriteAccounts.add(accountId);
    }
    saveState();
    render();
  }

  function toggleFavoriteRole(roleName) {
    if (state.favoriteRoles.has(roleName)) {
      state.favoriteRoles.delete(roleName);
    } else {
      state.favoriteRoles.add(roleName);
    }
    saveState();
    render();
  }

  function toggleFavoriteCombo(accountId, roleName) {
    const key = `${accountId}:${roleName}`;
    if (state.favoriteCombos.has(key)) {
      state.favoriteCombos.delete(key);
    } else {
      state.favoriteCombos.add(key);
    }
    saveState();
    render();
  }

  function isFavorite(accountId, roleName) {
    return state.favoriteAccounts.has(accountId) ||
           state.favoriteRoles.has(roleName) ||
           state.favoriteCombos.has(`${accountId}:${roleName}`);
  }

  // ========== DATA REFRESH ==========
  function refreshAccountData() {
    state.accounts = getAccountButtons().map(btn => {
      const info = parseAccountButton(btn);
      const roles = getAccountRoles(btn);
      return { ...info, roles };
    });
  }

  // ========== FILTERING ==========
  function getFilteredAccounts() {
    const af = state.accountFilter.toLowerCase();
    const rf = state.roleFilter.toLowerCase();
    
    return state.accounts.map(acc => {
      const accountMatches = !af || 
        acc.name.toLowerCase().includes(af) ||
        acc.id.includes(af) ||
        acc.email.toLowerCase().includes(af);
      
      const filteredRoles = acc.roles.filter(role => {
        const roleMatches = !rf || role.name.toLowerCase().includes(rf);
        const isFav = isFavorite(acc.id, role.name);
        return roleMatches && (!state.showFavoritesOnly || isFav);
      });
      
      const hasMatchingRoles = filteredRoles.length > 0 || acc.roles.length === 0;
      const hasFavoriteRole = acc.roles.some(r => isFavorite(acc.id, r.name));
      
      const show = accountMatches && hasMatchingRoles && 
        (!state.showFavoritesOnly || hasFavoriteRole || state.favoriteAccounts.has(acc.id));
      
      return { ...acc, filteredRoles, show };
    }).filter(a => a.show);
  }

  function getFavoriteItems() {
    // Get all favorite combos with account context
    const items = [];
    
    state.accounts.forEach(acc => {
      acc.roles.forEach(role => {
        if (isFavorite(acc.id, role.name)) {
          items.push({
            accountId: acc.id,
            accountName: acc.name,
            roleName: role.name,
            consoleUrl: role.consoleUrl,
            isFavAccount: state.favoriteAccounts.has(acc.id),
            isFavRole: state.favoriteRoles.has(role.name),
            isFavCombo: state.favoriteCombos.has(`${acc.id}:${role.name}`)
          });
        }
      });
    });
    
    // Sort: combos first, then by account name
    return items.sort((a, b) => {
      if (a.isFavCombo !== b.isFavCombo) return a.isFavCombo ? -1 : 1;
      return a.accountName.localeCompare(b.accountName);
    });
  }

  // ========== UI RENDERING ==========
  function render() {
    // Prevent re-entrant rendering
    if (isRendering) {
      renderQueued = true;
      return;
    }
    
    const container = $('#sso-enhancer-app');
    if (!container) return;
    
    isRendering = true;
    
    // Save focus state before DOM update
    const activeEl = document.activeElement;
    const focusId = activeEl?.id;
    const selStart = activeEl?.selectionStart;
    const selEnd = activeEl?.selectionEnd;
    
    const filtered = getFilteredAccounts();
    const favorites = getFavoriteItems();
    const totalRoles = state.accounts.reduce((sum, a) => sum + a.roles.length, 0);
    const visibleRoles = filtered.reduce((sum, a) => sum + a.filteredRoles.length, 0);
    
    container.innerHTML = `
      <div class="sse-toolbar">
        <div class="sse-toolbar-left">
          <input type="text" class="sse-input" id="sse-account-filter" 
                 placeholder="🔍 Account..." value="${escapeHtml(state.accountFilter)}">
          <input type="text" class="sse-input" id="sse-role-filter" 
                 placeholder="🔍 Role..." value="${escapeHtml(state.roleFilter)}">
          <label class="sse-toggle">
            <input type="checkbox" id="sse-favorites-only" ${state.showFavoritesOnly ? 'checked' : ''}>
            <span>★ Favorites</span>
          </label>
        </div>
        <div class="sse-toolbar-right">
          <span class="sse-stats">${filtered.length}/${state.accounts.length} accounts · ${visibleRoles}/${totalRoles} roles</span>
          <button class="sse-btn sse-btn-primary" id="sse-expand-all" data-action="expand-all" ${state.isLoading ? 'disabled' : ''}>
            ${state.isLoading ? `⏳ ${state.loadingProgress.current}/${state.loadingProgress.total}` : '📂 Expand All'}
          </button>
        </div>
      </div>
      
      ${renderQuickAccessPanel(favorites)}
      
      <div class="sse-accounts">
        ${filtered.map(acc => renderAccount(acc)).join('')}
        ${filtered.length === 0 ? '<div class="sse-empty">No matching accounts</div>' : ''}
      </div>
    `;
    
    bindEvents();
    
    // Restore focus after DOM update
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) {
        el.focus();
        if (typeof selStart === 'number' && el.setSelectionRange) {
          el.setSelectionRange(selStart, selEnd);
        }
      }
    }
    
    isRendering = false;
    if (renderQueued) {
      renderQueued = false;
      setTimeout(render, 0);
    }
  }

  function renderQuickAccessOnly() {
    const container = $('.sse-quick-access');
    if (!container) return;
    const favorites = getFavoriteItems();
    const newHtml = renderQuickAccessPanel(favorites);
    if (newHtml) {
      const temp = document.createElement('div');
      temp.innerHTML = newHtml;
      const newPanel = temp.firstElementChild;
      if (newPanel) container.replaceWith(newPanel);
    }
  }

  function renderQuickAccessPanel(favorites) {
    const recent = getRecentlyUsed(5);
    const frequent = getFrequentlyUsed(5);
    const hasContent = favorites.length > 0 || recent.length > 0 || frequent.length > 0;
    if (!hasContent) return '';

    const renderCard = (item, showCount = false) => `
      <a href="${item.consoleUrl}" class="sse-qa-card" target="_blank" 
         data-track="${item.accountId || ''}" data-track-name="${escapeHtml(item.accountName || '')}" 
         data-track-role="${escapeHtml(item.roleName || '')}"
         title="${item.accountName} → ${item.roleName}">
        <span class="sse-qa-account">${escapeHtml(item.accountName || '')}</span>
        <span class="sse-qa-role-row">
          <span class="sse-qa-role">${escapeHtml(item.roleName || '')}</span>
          ${showCount ? `<span class="sse-qa-count">${item.count}×</span>` : ''}
        </span>
      </a>
    `;

    return `
      <div class="sse-quick-access">
        ${favorites.length > 0 ? `
          <div class="sse-qa-section">
            <div class="sse-qa-title">★ Favorites</div>
            <div class="sse-qa-list">
              ${favorites.slice(0, 6).map(f => renderCard({ 
                accountId: f.accountId, accountName: f.accountName, 
                roleName: f.roleName, consoleUrl: f.consoleUrl 
              })).join('')}
            </div>
          </div>
        ` : ''}
        ${recent.length > 0 ? `
          <div class="sse-qa-section">
            <div class="sse-qa-title">🕐 Recent</div>
            <div class="sse-qa-list">
              ${recent.map(r => renderCard(r)).join('')}
            </div>
          </div>
        ` : ''}
        ${frequent.length > 0 ? `
          <div class="sse-qa-section">
            <div class="sse-qa-title">🔥 Frequent</div>
            <div class="sse-qa-list">
              ${frequent.map(f => renderCard(f, true)).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderAccount(acc) {
    const isExpanded = acc.roles.length > 0;
    const isFavAcc = state.favoriteAccounts.has(acc.id);
    
    return `
      <div class="sse-account ${isFavAcc ? 'sse-account-fav' : ''}" data-account-id="${acc.id}">
        <div class="sse-account-header">
          <button class="sse-star ${isFavAcc ? 'active' : ''}" data-action="fav-account" data-id="${acc.id}" title="Favorite account">
            ${isFavAcc ? '★' : '☆'}
          </button>
          <div class="sse-account-info">
            <span class="sse-account-name">${escapeHtml(acc.name)}</span>
            <span class="sse-account-id">${acc.id}</span>
          </div>
          <button class="sse-expand-btn" data-action="expand" data-id="${acc.id}">
            ${isExpanded ? '▼' : '▶'}
          </button>
        </div>
        ${isExpanded ? `
          <div class="sse-roles">
            ${acc.filteredRoles.map(role => renderRole(acc, role)).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderRole(acc, role) {
    const isFavRole = state.favoriteRoles.has(role.name);
    const isFavCombo = state.favoriteCombos.has(`${acc.id}:${role.name}`);
    const starClass = isFavCombo ? 'combo' : (isFavRole ? 'role' : '');
    
    return `
      <div class="sse-role ${isFavCombo || isFavRole ? 'sse-role-fav' : ''}">
        <button class="sse-star ${starClass}" data-action="fav-role" data-account="${acc.id}" data-role="${escapeHtml(role.name)}" 
                title="Click: favorite combo, Shift+Click: favorite role everywhere">
          ${isFavCombo ? '★' : (isFavRole ? '◆' : '☆')}
        </button>
        <a href="${role.consoleUrl}" class="sse-role-name" target="_blank">${escapeHtml(role.name)}</a>
        <a href="#" class="sse-role-keys" data-action="keys" data-account="${acc.id}" data-role="${escapeHtml(role.name)}">🔑</a>
      </div>
    `;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ========== EVENT BINDING ==========
  let eventsBound = false;
  
  function bindEvents() {
    const app = $('#sso-enhancer-app');
    if (!app) return;
    
    // Only bind delegated events once
    if (eventsBound) return;
    eventsBound = true;
    
    // Delegated events - handles all clicks via event delegation
    app.addEventListener('click', e => {
      const action = e.target.closest('[data-action]');
      if (!action) return;
      
      const actionType = action.dataset.action;
      
      if (actionType === 'fav-account') {
        toggleFavoriteAccount(action.dataset.id);
      } else if (actionType === 'fav-role') {
        const accountId = action.dataset.account;
        const roleName = action.dataset.role;
        if (e.shiftKey) {
          toggleFavoriteRole(roleName);
        } else {
          toggleFavoriteCombo(accountId, roleName);
        }
      } else if (actionType === 'expand') {
        const accData = state.accounts.find(a => a.id === action.dataset.id);
        if (accData?.element) {
          accData.element.click();
          setTimeout(() => {
            refreshAccountData();
            render();
          }, 500);
        }
      } else if (actionType === 'keys') {
        e.preventDefault();
        const accountId = action.dataset.account;
        const roleName = action.dataset.role;
        const acc = state.accounts.find(a => a.id === accountId);
        const role = acc?.roles.find(r => r.name === roleName);
        if (role?.keysElement) role.keysElement.click();
      } else if (actionType === 'expand-all') {
        expandAllAccounts(progress => {
          const btn = $('#sse-expand-all');
          if (btn) btn.textContent = `⏳ ${progress.current}/${progress.total}`;
        }).then(() => render());
      }
    });
    
    // Delegated input events
    app.addEventListener('input', e => {
      if (e.target.id === 'sse-account-filter') {
        state.accountFilter = e.target.value;
        render();
      } else if (e.target.id === 'sse-role-filter') {
        state.roleFilter = e.target.value;
        render();
      }
    });
    
    app.addEventListener('change', e => {
      if (e.target.id === 'sse-favorites-only') {
        state.showFavoritesOnly = e.target.checked;
        render();
      }
    });

    // Track usage when clicking role links or quick access cards
    app.addEventListener('click', e => {
      let tracked = false;
      // Quick access cards
      const qaCard = e.target.closest('.sse-qa-card[data-track]');
      if (qaCard && qaCard.dataset.track) {
        trackUsage(qaCard.dataset.track, qaCard.dataset.trackName, qaCard.dataset.trackRole, qaCard.href);
        tracked = true;
      }
      // Role links in main list
      const roleLink = e.target.closest('.sse-role-name');
      if (roleLink) {
        const roleEl = roleLink.closest('.sse-role');
        const accountEl = roleLink.closest('.sse-account');
        if (roleEl && accountEl) {
          const accountId = accountEl.dataset.accountId;
          const acc = state.accounts.find(a => a.id === accountId);
          if (acc) {
            const roleName = roleLink.textContent.trim();
            trackUsage(accountId, acc.name, roleName, roleLink.href);
            tracked = true;
          }
        }
      }
      // Re-render quick access immediately to show updated recent/frequent
      if (tracked) {
        setTimeout(() => renderQuickAccessOnly(), 50);
      }
    });
  }

  // ========== STYLES ==========
  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'sso-enhancer-styles';
    style.textContent = `
      #sso-enhancer-app {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0d1117;
        color: #e6edf3;
        min-height: 100vh;
        padding: 0;
      }
      
      .sse-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 20px;
        background: linear-gradient(180deg, #161b22 0%, #0d1117 100%);
        border-bottom: 1px solid #30363d;
        position: sticky;
        top: 0;
        z-index: 100;
        gap: 16px;
        flex-wrap: wrap;
      }
      
      .sse-toolbar-left {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      
      .sse-toolbar-right {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      
      .sse-input {
        padding: 8px 12px;
        background: #21262d;
        border: 1px solid #30363d;
        border-radius: 6px;
        color: #e6edf3;
        font-size: 13px;
        width: 160px;
        transition: all 0.15s;
      }
      
      .sse-input:focus {
        outline: none;
        border-color: #ff9900;
        box-shadow: 0 0 0 2px rgba(255,153,0,0.2);
      }
      
      .sse-toggle {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-size: 13px;
        color: #ffd700;
        padding: 8px 12px;
        background: #21262d;
        border-radius: 6px;
        border: 1px solid #30363d;
        transition: all 0.15s;
      }
      
      .sse-toggle:hover {
        background: #30363d;
      }
      
      .sse-toggle input {
        accent-color: #ff9900;
      }
      
      .sse-stats {
        font-size: 12px;
        color: #8b949e;
      }
      
      .sse-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid #30363d;
        background: #21262d;
        color: #e6edf3;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }
      
      .sse-btn:hover:not(:disabled) {
        background: #30363d;
      }
      
      .sse-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      
      .sse-btn-primary {
        background: #ff9900;
        border-color: #ff9900;
        color: #000;
      }
      
      .sse-btn-primary:hover:not(:disabled) {
        background: #e68a00;
      }
      
      /* Quick Access Panel */
      .sse-quick-access {
        display: flex;
        gap: 20px;
        padding: 12px 20px;
        background: rgba(255,215,0,0.02);
        border-bottom: 1px solid #30363d;
        overflow-x: auto;
      }
      
      .sse-qa-section {
        flex: 1;
        min-width: 200px;
        max-width: 300px;
      }
      
      .sse-qa-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #8b949e;
        margin-bottom: 8px;
        white-space: nowrap;
      }
      
      .sse-qa-section:first-child .sse-qa-title { color: #ffd700; }
      .sse-qa-section:nth-child(2) .sse-qa-title { color: #58a6ff; }
      .sse-qa-section:nth-child(3) .sse-qa-title { color: #f97316; }
      
      .sse-qa-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .sse-qa-card {
        display: flex;
        flex-direction: column;
        padding: 6px 10px;
        background: #21262d;
        border: 1px solid #30363d;
        border-radius: 4px;
        text-decoration: none;
        color: inherit;
        transition: all 0.15s;
      }
      
      .sse-qa-card:hover {
        background: #30363d;
        border-color: #484f58;
      }
      
      .sse-qa-account {
        font-size: 12px;
        color: #e6edf3;
        margin-bottom: 2px;
      }
      
      .sse-qa-role-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      
      .sse-qa-role {
        font-size: 11px;
        color: #58a6ff;
      }
      
      .sse-qa-count {
        font-size: 10px;
        color: #6e7681;
        background: #161b22;
        padding: 1px 4px;
        border-radius: 3px;
      }
      
      /* Accounts List */
      .sse-accounts {
        padding: 12px 20px;
      }
      
      .sse-account {
        margin-bottom: 8px;
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        overflow: hidden;
        transition: all 0.15s;
      }
      
      .sse-account:hover {
        border-color: #484f58;
      }
      
      .sse-account-fav {
        border-color: rgba(255,215,0,0.3);
      }
      
      .sse-account-header {
        display: flex;
        align-items: center;
        padding: 10px 14px;
        gap: 10px;
        cursor: pointer;
      }
      
      .sse-account-info {
        flex: 1;
        display: flex;
        align-items: baseline;
        gap: 10px;
      }
      
      .sse-account-name {
        font-weight: 600;
        font-size: 14px;
      }
      
      .sse-account-id {
        font-size: 12px;
        color: #8b949e;
        font-family: 'SF Mono', Monaco, monospace;
      }
      
      .sse-expand-btn {
        background: none;
        border: none;
        color: #8b949e;
        cursor: pointer;
        padding: 4px 8px;
        font-size: 10px;
        transition: color 0.15s;
      }
      
      .sse-expand-btn:hover {
        color: #e6edf3;
      }
      
      .sse-star {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 16px;
        color: #6e7681;
        padding: 2px;
        transition: all 0.15s;
      }
      
      .sse-star:hover {
        transform: scale(1.2);
      }
      
      .sse-star.active, .sse-star.combo {
        color: #ffd700;
      }
      
      .sse-star.role {
        color: #58a6ff;
      }
      
      /* Roles */
      .sse-roles {
        border-top: 1px solid #21262d;
        padding: 6px 14px;
        background: #0d1117;
      }
      
      .sse-role {
        display: flex;
        align-items: center;
        padding: 6px 8px;
        gap: 8px;
        border-radius: 4px;
        transition: background 0.1s;
      }
      
      .sse-role:hover {
        background: #21262d;
      }
      
      .sse-role-fav {
        background: rgba(255,215,0,0.05);
      }
      
      .sse-role-name {
        flex: 1;
        color: #58a6ff;
        text-decoration: none;
        font-size: 13px;
        font-family: 'SF Mono', Monaco, monospace;
      }
      
      .sse-role-name:hover {
        text-decoration: underline;
      }
      
      .sse-role-keys {
        color: #8b949e;
        text-decoration: none;
        font-size: 14px;
        opacity: 0.5;
        transition: opacity 0.15s;
      }
      
      .sse-role:hover .sse-role-keys {
        opacity: 1;
      }
      
      .sse-empty {
        text-align: center;
        padding: 40px;
        color: #8b949e;
        font-size: 14px;
      }
      
      /* Hide original AWS UI */
      .sse-hidden {
        display: none !important;
      }
      
      ${HIDE_HEADERS ? `
      /* Hide AWS page headers/tabs */
      [class*="awsui_tabs-header-with-divider"],
      [class*="awsui_m-bottom-s"][class*="awsui_box_18wu0"] {
        display: none !important;
      }
      ` : ''}
    `;
    document.head.appendChild(style);
  }

  // ========== INITIALIZATION ==========
  function createApp() {
    // Find the main content area and replace it
    const mainContent = $('[data-testid="account-list"]') || 
                        $('main') || 
                        $('.awsui_content_hyvsj_1ukp9_145');
    
    if (!mainContent) {
      console.log('SSO Enhancer: Could not find main content area');
      return;
    }
    
    // Hide original content
    mainContent.classList.add('sse-hidden');
    
    // Create our app container
    const app = document.createElement('div');
    app.id = 'sso-enhancer-app';
    mainContent.parentNode.insertBefore(app, mainContent);
    
    return app;
  }

  function init() {
    console.log('AWS SSO Enhancer initializing... ☁️');
    
    loadState();
    injectStyles();
    
    // Wait for page to be ready
    const checkReady = setInterval(() => {
      const buttons = getAccountButtons();
      if (buttons.length > 0) {
        clearInterval(checkReady);
        
        const app = createApp();
        if (app) {
          refreshAccountData();
          render();
          console.log('AWS SSO Enhancer ready! ☁️');
        }
      }
    }, 200);
    
    // Timeout after 10s
    setTimeout(() => clearInterval(checkReady), 10000);
  }

  // Start
  init();
  window.__awsSsoEnhancer = { state, render, refreshAccountData };
})();
