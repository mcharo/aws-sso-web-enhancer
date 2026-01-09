// AWS SSO Page Enhancer Bookmarklet
// Adds filtering, favorites, and UI enhancements to the AWS SSO account selection page

(function() {
  'use strict';

  // Prevent double-initialization
  if (window.__awsSsoEnhancer) {
    console.log('AWS SSO Enhancer already running');
    window.__awsSsoEnhancer.toggle();
    return;
  }

  const STORAGE_KEY = 'awsSsoEnhancer_favorites';
  const EXPANDED_KEY = 'awsSsoEnhancer_expanded';
  
  // State
  let favorites = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  let isExpanding = false;
  let panel = null;
  let accountFilter = '';
  let roleFilter = '';
  let showFavoritesOnly = false;

  // Save favorites to localStorage
  function saveFavorites() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  }

  // Get favorite key
  function getFavKey(accountId, roleName) {
    return `${accountId}:${roleName}`;
  }

  // Toggle favorite
  function toggleFavorite(accountId, roleName) {
    const key = getFavKey(accountId, roleName);
    if (favorites.has(key)) {
      favorites.delete(key);
    } else {
      favorites.add(key);
    }
    saveFavorites();
    applyFilters();
    renderFavoritesList();
  }

  // Check if favorite
  function isFavorite(accountId, roleName) {
    return favorites.has(getFavKey(accountId, roleName));
  }

  // Get all account buttons
  function getAccountButtons() {
    return document.querySelectorAll('button[data-testid="account-list-cell"]');
  }

  // Get account info from button
  function getAccountInfo(button) {
    const container = button.closest('.UQDbz64f0aRBYmzupdOU') || button.closest('[class*="cevwRopJqwHgUyz"]') || button.parentElement;
    const nameEl = button.querySelector('strong span');
    const spans = button.querySelectorAll('p span');
    
    let accountId = '';
    let accountName = nameEl ? nameEl.textContent.trim() : '';
    let email = '';
    
    spans.forEach(span => {
      const text = span.textContent.trim();
      if (/^\d{12}$/.test(text)) {
        accountId = text;
      } else if (text.includes('@')) {
        email = text;
      }
    });

    return { container, accountId, accountName, email, button };
  }

  // Get roles for an expanded account
  function getAccountRoles(accountContainer) {
    const roleContainer = accountContainer.querySelector('[data-testid="role-list-container"]');
    if (!roleContainer) return [];
    
    const roleItems = roleContainer.querySelectorAll('[data-testid="role-list-item"]');
    return Array.from(roleItems).map(item => {
      const link = item.querySelector('[data-testid="federation-link"]');
      const roleName = link ? link.textContent.trim() : '';
      const href = link ? link.getAttribute('href') : '';
      return { roleName, href, element: item };
    });
  }

  // Expand all accounts with delay to avoid rate limiting
  async function expandAllAccounts(progressCallback) {
    if (isExpanding) return;
    isExpanding = true;
    
    const buttons = getAccountButtons();
    const unexpanded = Array.from(buttons).filter(b => b.getAttribute('aria-expanded') === 'false');
    
    let expanded = 0;
    let delay = 150; // Start with 150ms delay
    const maxDelay = 2000;
    const minDelay = 100;
    let consecutiveSuccess = 0;
    
    for (const button of unexpanded) {
      button.click();
      expanded++;
      if (progressCallback) {
        progressCallback(expanded, unexpanded.length, delay);
      }
      
      // Wait and check for rate limiting
      await new Promise(r => setTimeout(r, delay));
      
      // Adaptive delay - slow down if we're going too fast
      // Speed up gradually after successful batches
      if (expanded % 5 === 0) {
        consecutiveSuccess++;
        if (consecutiveSuccess > 2 && delay > minDelay) {
          delay = Math.max(minDelay, delay - 25);
        }
      }
    }
    
    isExpanding = false;
    return expanded;
  }
  
  // Expand accounts sequentially with delays to avoid rate limiting
  async function expandAccountsBatched(progressCallback, batchSize = 3) {
    if (isExpanding) return;
    isExpanding = true;
    
    const buttons = getAccountButtons();
    const unexpanded = Array.from(buttons).filter(b => b.getAttribute('aria-expanded') === 'false');
    
    let expanded = 0;
    
    for (let i = 0; i < unexpanded.length; i++) {
      const button = unexpanded[i];
      button.click();
      expanded++;
      
      if (progressCallback) {
        progressCallback(expanded, unexpanded.length);
      }
      
      // Delay after each expansion - longer pause every few accounts
      if ((i + 1) % batchSize === 0) {
        // Longer pause every 3 accounts (batch boundary)
        await new Promise(r => setTimeout(r, 3000));
      } else {
        // Short delay between individual accounts
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    isExpanding = false;
    return expanded;
  }

  // Collapse all accounts
  function collapseAllAccounts() {
    const buttons = getAccountButtons();
    buttons.forEach(button => {
      if (button.getAttribute('aria-expanded') === 'true') {
        button.click();
      }
    });
  }

  // Apply filters to show/hide accounts and roles
  function applyFilters() {
    const buttons = getAccountButtons();
    const accountFilterLower = accountFilter.toLowerCase();
    const roleFilterLower = roleFilter.toLowerCase();
    
    let visibleAccounts = 0;
    let visibleRoles = 0;
    let totalRoles = 0;

    buttons.forEach(button => {
      const info = getAccountInfo(button);
      const container = info.container;
      if (!container) return;
      
      // Check account match
      const accountMatches = !accountFilterLower || 
        info.accountName.toLowerCase().includes(accountFilterLower) ||
        info.accountId.includes(accountFilterLower) ||
        info.email.toLowerCase().includes(accountFilterLower);
      
      // Get roles and check matches
      const roles = getAccountRoles(container);
      totalRoles += roles.length;
      
      let hasMatchingRole = roles.length === 0; // If no roles loaded yet, don't hide
      let hasVisibleRole = false;
      let hasFavoriteRole = false;
      
      roles.forEach(role => {
        const roleMatches = !roleFilterLower || role.roleName.toLowerCase().includes(roleFilterLower);
        const isFav = isFavorite(info.accountId, role.roleName);
        
        if (isFav) hasFavoriteRole = true;
        
        const shouldShowRole = roleMatches && (!showFavoritesOnly || isFav);
        
        if (role.element) {
          role.element.style.display = shouldShowRole ? '' : 'none';
        }
        
        if (shouldShowRole) {
          hasVisibleRole = true;
          visibleRoles++;
        }
        if (roleMatches) hasMatchingRole = true;
      });
      
      // Show account if it matches AND has matching roles (or no role filter)
      const shouldShowAccount = accountMatches && 
        (hasMatchingRole || !roleFilterLower) && 
        (!showFavoritesOnly || hasFavoriteRole || roles.length === 0);
      
      // Find the outermost container to hide
      const outerContainer = container.closest('.cevwRopJqwHgUyz_lEix') || container;
      outerContainer.style.display = shouldShowAccount ? '' : 'none';
      
      if (shouldShowAccount) visibleAccounts++;
    });
    
    // Update stats
    updateStats(visibleAccounts, buttons.length, visibleRoles, totalRoles);
  }

  // Update stats display
  function updateStats(visibleAccounts, totalAccounts, visibleRoles, totalRoles) {
    const statsEl = document.getElementById('sso-enhancer-stats');
    if (statsEl) {
      statsEl.innerHTML = `
        <span>Accounts: <strong>${visibleAccounts}/${totalAccounts}</strong></span>
        <span>Roles: <strong>${visibleRoles}/${totalRoles}</strong></span>
        <span>Favorites: <strong>${favorites.size}</strong></span>
      `;
    }
  }

  // Add favorite stars to role items
  function injectFavoriteStars() {
    const buttons = getAccountButtons();
    
    buttons.forEach(button => {
      const info = getAccountInfo(button);
      const container = info.container;
      if (!container) return;
      
      const roles = getAccountRoles(container);
      
      roles.forEach(role => {
        // Check if star already exists
        if (role.element.querySelector('.sso-enhancer-star')) return;
        
        const star = document.createElement('button');
        star.className = 'sso-enhancer-star';
        star.innerHTML = isFavorite(info.accountId, role.roleName) ? '★' : '☆';
        star.style.cssText = `
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          color: ${isFavorite(info.accountId, role.roleName) ? '#ffd700' : '#666'};
          padding: 0 8px;
          margin-right: 4px;
          transition: all 0.2s;
          vertical-align: middle;
        `;
        star.title = isFavorite(info.accountId, role.roleName) ? 'Remove from favorites' : 'Add to favorites';
        
        star.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(info.accountId, role.roleName);
          star.innerHTML = isFavorite(info.accountId, role.roleName) ? '★' : '☆';
          star.style.color = isFavorite(info.accountId, role.roleName) ? '#ffd700' : '#666';
          star.title = isFavorite(info.accountId, role.roleName) ? 'Remove from favorites' : 'Add to favorites';
        });
        
        star.addEventListener('mouseenter', () => {
          star.style.transform = 'scale(1.2)';
        });
        star.addEventListener('mouseleave', () => {
          star.style.transform = 'scale(1)';
        });
        
        role.element.insertBefore(star, role.element.firstChild);
      });
    });
  }

  // Render favorites quick access list
  function renderFavoritesList() {
    const container = document.getElementById('sso-enhancer-favorites');
    if (!container) return;
    
    if (favorites.size === 0) {
      container.innerHTML = '<div style="color: #888; font-style: italic;">No favorites yet. Click ☆ next to roles to add them.</div>';
      return;
    }
    
    // Get current account data
    const accountMap = new Map();
    getAccountButtons().forEach(button => {
      const info = getAccountInfo(button);
      if (info.accountId) {
        accountMap.set(info.accountId, info);
      }
    });
    
    let html = '';
    [...favorites].sort().forEach(fav => {
      const [accountId, roleName] = fav.split(':');
      const accountInfo = accountMap.get(accountId);
      const accountName = accountInfo ? accountInfo.accountName : accountId;
      
      html += `
        <div class="sso-enhancer-fav-item" data-account="${accountId}" data-role="${roleName}">
          <div class="sso-enhancer-fav-info">
            <span class="sso-enhancer-fav-account">${accountName}</span>
            <span class="sso-enhancer-fav-role">${roleName}</span>
          </div>
          <div class="sso-enhancer-fav-actions">
            <a href="#/console?account_id=${accountId}&role_name=${encodeURIComponent(roleName)}" 
               target="_blank" class="sso-enhancer-btn sso-enhancer-btn-console">Console</a>
            <button class="sso-enhancer-btn sso-enhancer-btn-remove" data-fav="${fav}">✕</button>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
    
    // Add remove handlers
    container.querySelectorAll('.sso-enhancer-btn-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const fav = btn.dataset.fav;
        favorites.delete(fav);
        saveFavorites();
        renderFavoritesList();
        injectFavoriteStars();
        applyFilters();
      });
    });
  }

  // Create the enhancer panel
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'sso-enhancer-panel';
    panel.innerHTML = `
      <div class="sso-enhancer-header">
        <div class="sso-enhancer-title">
          <span class="sso-enhancer-logo">☁️</span>
          <span>SSO Enhancer</span>
        </div>
        <button id="sso-enhancer-close" class="sso-enhancer-close">×</button>
      </div>
      
      <div class="sso-enhancer-section">
        <div class="sso-enhancer-actions">
          <button id="sso-enhancer-expand" class="sso-enhancer-btn sso-enhancer-btn-primary" title="Expand 5 at a time with pauses (safer)">
            📂 Expand All
          </button>
          <button id="sso-enhancer-collapse" class="sso-enhancer-btn">
            📁 Collapse
          </button>
        </div>
        <div id="sso-enhancer-progress" style="display: none;">
          <div class="sso-enhancer-progress-bar">
            <div class="sso-enhancer-progress-fill"></div>
          </div>
          <span class="sso-enhancer-progress-text">0/0</span>
        </div>
        <div id="sso-enhancer-rate-warning" style="display: none; margin-top: 8px; padding: 8px; background: rgba(255,100,100,0.1); border-radius: 4px; font-size: 11px; color: #ff9999;">
          ⚠️ Going slow to avoid rate limits...
        </div>
      </div>
      
      <div class="sso-enhancer-section">
        <label class="sso-enhancer-label">Filter by Account</label>
        <input type="text" id="sso-enhancer-account-filter" class="sso-enhancer-input" 
               placeholder="Name, ID, or email...">
      </div>
      
      <div class="sso-enhancer-section">
        <label class="sso-enhancer-label">Filter by Role</label>
        <input type="text" id="sso-enhancer-role-filter" class="sso-enhancer-input" 
               placeholder="Permission set name...">
      </div>
      
      <div class="sso-enhancer-section">
        <label class="sso-enhancer-toggle-container">
          <input type="checkbox" id="sso-enhancer-favorites-only">
          <span class="sso-enhancer-toggle-label">★ Show favorites only</span>
        </label>
      </div>
      
      <div id="sso-enhancer-stats" class="sso-enhancer-stats"></div>
      
      <div class="sso-enhancer-section">
        <div class="sso-enhancer-label" style="margin-bottom: 8px;">★ Quick Access</div>
        <div id="sso-enhancer-favorites" class="sso-enhancer-favorites"></div>
      </div>
      
      <div class="sso-enhancer-footer">
        <button id="sso-enhancer-refresh" class="sso-enhancer-btn">🔄 Refresh</button>
        <button id="sso-enhancer-export" class="sso-enhancer-btn">📤 Export</button>
      </div>
    `;
    
    // Inject styles
    const style = document.createElement('style');
    style.id = 'sso-enhancer-styles';
    style.textContent = `
      #sso-enhancer-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 340px;
        max-height: calc(100vh - 40px);
        background: linear-gradient(135deg, #1a1f2e 0%, #0d1117 100%);
        border: 1px solid #30363d;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        z-index: 99999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        color: #e6edf3;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      
      #sso-enhancer-panel.minimized {
        width: auto;
        height: auto;
        max-height: none;
      }
      
      #sso-enhancer-panel.minimized > *:not(.sso-enhancer-header) {
        display: none !important;
      }
      
      .sso-enhancer-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: rgba(255,153,0,0.1);
        border-bottom: 1px solid #30363d;
        cursor: move;
      }
      
      .sso-enhancer-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
      }
      
      .sso-enhancer-logo {
        font-size: 18px;
      }
      
      .sso-enhancer-close {
        background: none;
        border: none;
        color: #8b949e;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        transition: color 0.2s;
      }
      
      .sso-enhancer-close:hover {
        color: #ff6b6b;
      }
      
      .sso-enhancer-section {
        padding: 12px 16px;
        border-bottom: 1px solid #21262d;
      }
      
      .sso-enhancer-label {
        display: block;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #8b949e;
        margin-bottom: 6px;
      }
      
      .sso-enhancer-input {
        width: 100%;
        padding: 10px 12px;
        background: #0d1117;
        border: 1px solid #30363d;
        border-radius: 6px;
        color: #e6edf3;
        font-size: 13px;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      
      .sso-enhancer-input:focus {
        outline: none;
        border-color: #ff9900;
        box-shadow: 0 0 0 3px rgba(255,153,0,0.15);
      }
      
      .sso-enhancer-input::placeholder {
        color: #6e7681;
      }
      
      .sso-enhancer-actions {
        display: flex;
        gap: 8px;
      }
      
      .sso-enhancer-btn {
        padding: 8px 14px;
        border-radius: 6px;
        border: 1px solid #30363d;
        background: #21262d;
        color: #e6edf3;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      
      .sso-enhancer-btn:hover {
        background: #30363d;
        border-color: #8b949e;
      }
      
      .sso-enhancer-btn-primary {
        background: #ff9900;
        border-color: #ff9900;
        color: #000;
      }
      
      .sso-enhancer-btn-primary:hover {
        background: #e68a00;
        border-color: #e68a00;
      }
      
      .sso-enhancer-btn-console {
        background: #238636;
        border-color: #238636;
        color: #fff;
        font-size: 11px;
        padding: 4px 10px;
      }
      
      .sso-enhancer-btn-console:hover {
        background: #2ea043;
      }
      
      .sso-enhancer-btn-remove {
        background: transparent;
        border: none;
        color: #8b949e;
        padding: 4px 8px;
        font-size: 14px;
      }
      
      .sso-enhancer-btn-remove:hover {
        color: #ff6b6b;
      }
      
      .sso-enhancer-toggle-container {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }
      
      .sso-enhancer-toggle-container input {
        width: 16px;
        height: 16px;
        accent-color: #ff9900;
      }
      
      .sso-enhancer-toggle-label {
        font-size: 13px;
        color: #ffd700;
      }
      
      .sso-enhancer-stats {
        display: flex;
        gap: 16px;
        padding: 10px 16px;
        background: #0d1117;
        font-size: 12px;
        color: #8b949e;
      }
      
      .sso-enhancer-stats strong {
        color: #ff9900;
        font-family: 'SF Mono', Monaco, monospace;
      }
      
      .sso-enhancer-favorites {
        max-height: 200px;
        overflow-y: auto;
      }
      
      .sso-enhancer-fav-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        margin: 4px 0;
        background: rgba(255,215,0,0.05);
        border: 1px solid rgba(255,215,0,0.2);
        border-radius: 6px;
        transition: background 0.2s;
      }
      
      .sso-enhancer-fav-item:hover {
        background: rgba(255,215,0,0.1);
      }
      
      .sso-enhancer-fav-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      
      .sso-enhancer-fav-account {
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .sso-enhancer-fav-role {
        font-size: 11px;
        color: #58a6ff;
        font-family: 'SF Mono', Monaco, monospace;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      
      .sso-enhancer-fav-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      
      .sso-enhancer-footer {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #21262d;
      }
      
      .sso-enhancer-progress-bar {
        height: 4px;
        background: #21262d;
        border-radius: 2px;
        overflow: hidden;
        margin-top: 8px;
      }
      
      .sso-enhancer-progress-fill {
        height: 100%;
        background: #ff9900;
        border-radius: 2px;
        transition: width 0.1s;
        width: 0%;
      }
      
      .sso-enhancer-progress-text {
        font-size: 11px;
        color: #8b949e;
        margin-top: 4px;
        display: block;
      }
      
      /* Scrollbar styling */
      .sso-enhancer-favorites::-webkit-scrollbar {
        width: 6px;
      }
      
      .sso-enhancer-favorites::-webkit-scrollbar-track {
        background: #0d1117;
        border-radius: 3px;
      }
      
      .sso-enhancer-favorites::-webkit-scrollbar-thumb {
        background: #30363d;
        border-radius: 3px;
      }
      
      .sso-enhancer-favorites::-webkit-scrollbar-thumb:hover {
        background: #484f58;
      }
      
      /* Highlight matched text */
      .sso-enhancer-highlight {
        background: rgba(255,153,0,0.3);
        border-radius: 2px;
      }
    `;
    
    document.head.appendChild(style);
    document.body.appendChild(panel);
    
    return panel;
  }

  // Set up event handlers
  function setupEventHandlers() {
    // Close button
    document.getElementById('sso-enhancer-close').addEventListener('click', () => {
      panel.classList.toggle('minimized');
    });
    
    // Expand all (batched to avoid rate limiting)
    document.getElementById('sso-enhancer-expand').addEventListener('click', async () => {
      const btn = document.getElementById('sso-enhancer-expand');
      const progress = document.getElementById('sso-enhancer-progress');
      const fill = progress.querySelector('.sso-enhancer-progress-fill');
      const text = progress.querySelector('.sso-enhancer-progress-text');
      const warning = document.getElementById('sso-enhancer-rate-warning');
      
      btn.disabled = true;
      btn.textContent = '⏳ Expanding...';
      progress.style.display = 'block';
      warning.style.display = 'block';
      
      await expandAccountsBatched((current, total) => {
        const pct = (current / total) * 100;
        fill.style.width = pct + '%';
        text.textContent = `${current}/${total}`;
      }, 3); // Pause every 3 accounts
      
      // After expanding, inject stars and apply filters
      setTimeout(() => {
        injectFavoriteStars();
        applyFilters();
        renderFavoritesList();
        
        btn.disabled = false;
        btn.textContent = '📂 Expand All';
        progress.style.display = 'none';
        warning.style.display = 'none';
        fill.style.width = '0%';
      }, 200);
    });
    
    // Collapse all
    document.getElementById('sso-enhancer-collapse').addEventListener('click', () => {
      collapseAllAccounts();
    });
    
    // Account filter
    document.getElementById('sso-enhancer-account-filter').addEventListener('input', (e) => {
      accountFilter = e.target.value;
      applyFilters();
    });
    
    // Role filter
    document.getElementById('sso-enhancer-role-filter').addEventListener('input', (e) => {
      roleFilter = e.target.value;
      applyFilters();
    });
    
    // Favorites only toggle
    document.getElementById('sso-enhancer-favorites-only').addEventListener('change', (e) => {
      showFavoritesOnly = e.target.checked;
      applyFilters();
    });
    
    // Refresh button
    document.getElementById('sso-enhancer-refresh').addEventListener('click', () => {
      injectFavoriteStars();
      applyFilters();
      renderFavoritesList();
    });
    
    // Export button
    document.getElementById('sso-enhancer-export').addEventListener('click', () => {
      const data = {
        favorites: [...favorites],
        exportedAt: new Date().toISOString(),
        ssoUrl: window.location.href
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'aws-sso-favorites.json';
      a.click();
      URL.revokeObjectURL(url);
    });
    
    // Make panel draggable
    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };
    
    const header = panel.querySelector('.sso-enhancer-header');
    header.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('sso-enhancer-close')) return;
      isDragging = true;
      dragOffset = {
        x: e.clientX - panel.offsetLeft,
        y: e.clientY - panel.offsetTop
      };
      panel.style.transition = 'none';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panel.style.left = (e.clientX - dragOffset.x) + 'px';
      panel.style.top = (e.clientY - dragOffset.y) + 'px';
      panel.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
      panel.style.transition = '';
    });
    
    // Watch for DOM changes to re-inject stars
    const observer = new MutationObserver(() => {
      setTimeout(() => {
        injectFavoriteStars();
        applyFilters();
      }, 100);
    });
    
    // Find the accounts container and observe it
    const accountsContainer = document.querySelector('[data-testid="account-list"]') || 
                              document.querySelector('#awsui-tabs-\\:r3f\\:-accounts-panel') ||
                              document.querySelector('[class*="account"]')?.closest('[class*="container"]');
    
    if (accountsContainer) {
      observer.observe(accountsContainer, { childList: true, subtree: true });
    }
  }

  // Toggle panel visibility
  function toggle() {
    if (panel) {
      panel.classList.toggle('minimized');
    }
  }

  // Initialize
  function init() {
    panel = createPanel();
    setupEventHandlers();
    renderFavoritesList();
    
    // Initial stats
    setTimeout(() => {
      applyFilters();
      injectFavoriteStars();
    }, 500);
    
    console.log('AWS SSO Enhancer initialized! ☁️');
  }

  // Run
  init();
  
  // Expose for toggle
  window.__awsSsoEnhancer = { toggle };
})();
