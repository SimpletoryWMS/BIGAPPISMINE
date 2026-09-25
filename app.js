/**
 * SIMPLETORY WMS - CORE APPLICATION CONTROLLER
 * Ultra-responsive, modern frontend logic for inventory, catalog, and audits.
 */

document.addEventListener('DOMContentLoaded', () => {
  const App = {
    currentView: 'dashboard',
    items: [],
    inventory: [],
    history: [],
    users: [],
    tenants: [],
    theme: localStorage.getItem('simpletory_theme') || 'dark',

    // ==========================================
    // INITIALIZATION
    // ==========================================
    async init() {
      this.applyTheme(this.theme);
      this.bindNavigation();
      this.bindModals();
      this.bindForms();
      this.bindGlobalActions();
      this.bindShortcuts();

      // Listen for data mutations (realtime or local)
      window.WMSDataService.onDataChange(() => {
        this.refreshAllData();
      });

      await this.loadTenants();
      await this.refreshAllData();
      this.updateSyncIndicator();
    },

    // ==========================================
    // THEME CONTROLLER
    // ==========================================
    applyTheme(theme) {
      this.theme = theme;
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('simpletory_theme', theme);
      const icon = document.getElementById('theme-toggle-icon');
      if (icon) {
        icon.innerHTML = theme === 'dark'
          ? `<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`
          : `<path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" fill="currentColor"/>`;
      }
    },

    toggleTheme() {
      this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
    },

    // ==========================================
    // NAVIGATION & VIEW SWITCHING
    // ==========================================
    bindNavigation() {
      const navItems = document.querySelectorAll('.nav-item');
      navItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const targetView = item.getAttribute('data-view');
          if (targetView) this.switchView(targetView);
        });
      });

      const tenantSelect = document.getElementById('tenant-select');
      if (tenantSelect) {
        tenantSelect.addEventListener('change', async (e) => {
          window.WMSDataService.activeTenantId = e.target.value;
          this.showToast(`Switched facility to: ${e.target.selectedOptions[0].text}`, 'info');
          await this.refreshAllData();
        });
      }
    },

    switchView(viewName) {
      this.currentView = viewName;
      
      // Update nav active class
      document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.getAttribute('data-view') === viewName);
      });

      // Update view containers
      document.querySelectorAll('.view-container').forEach(container => {
        container.classList.remove('active');
      });

      const targetEl = document.getElementById(`view-${viewName}`);
      if (targetEl) {
        targetEl.classList.add('active');
      }
    },

    // ==========================================
    // DATA LOADING & REFRESH
    // ==========================================
    async loadTenants() {
      this.tenants = await window.WMSDataService.getTenants();
      const select = document.getElementById('tenant-select');
      if (select) {
        select.innerHTML = this.tenants.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        select.value = window.WMSDataService.activeTenantId;
      }
    },

    async refreshAllData() {
      const tenantId = window.WMSDataService.activeTenantId;
      [this.items, this.inventory, this.history, this.users] = await Promise.all([
        window.WMSDataService.getItems(tenantId),
        window.WMSDataService.getInventory(tenantId),
        window.WMSDataService.getHistory(tenantId),
        window.WMSDataService.getUsers(tenantId)
      ]);

      this.renderDashboard();
      this.renderInventoryTable();
      this.renderItemsTable();
      this.renderHistoryTable();
      this.renderUsersTable();
      this.populateDropdowns();
      this.updateBadges();
    },

    updateSyncIndicator() {
      const isLive = window.WMSDataService.isSupabaseConnected;
      const dot = document.getElementById('sync-status-dot');
      const text = document.getElementById('sync-status-text');
      if (dot && text) {
        dot.className = isLive ? 'status-dot' : 'status-dot local';
        text.textContent = isLive ? 'Supabase Live' : 'Demo Local Mode';
      }
    },

    updateBadges() {
      const lowStockCount = this.inventory.filter(i => i.status === 'Low Stock' || i.status === 'Out of Stock').length;
      const badge = document.getElementById('nav-inventory-badge');
      if (badge) {
        badge.textContent = lowStockCount > 0 ? lowStockCount : this.inventory.length;
        badge.style.background = lowStockCount > 0 ? 'var(--danger)' : '';
        badge.style.color = lowStockCount > 0 ? '#fff' : '';
      }
    },

    // ==========================================
    // VIEW RENDERING: DASHBOARD
    // ==========================================
    renderDashboard() {
      const totalSkus = this.items.length;
      const totalUnits = this.inventory.reduce((acc, curr) => acc + Number(curr.quantity), 0);
      const lowStockCount = this.inventory.filter(inv => {
        const item = this.items.find(i => i.id === inv.item_id);
        return item && Number(inv.quantity) <= Number(item.reorder_point);
      }).length;

      const totalValuation = this.inventory.reduce((acc, inv) => {
        const item = this.items.find(i => i.id === inv.item_id);
        const cost = item ? Number(item.unit_cost) || 0 : 0;
        return acc + (Number(inv.quantity) * cost);
      }, 0);

      const elSkus = document.getElementById('stat-total-skus');
      const elUnits = document.getElementById('stat-total-units');
      const elLow = document.getElementById('stat-low-stock');
      const elVal = document.getElementById('stat-total-value');

      if (elSkus) elSkus.textContent = totalSkus.toLocaleString();
      if (elUnits) elUnits.textContent = totalUnits.toLocaleString();
      if (elLow) elLow.textContent = lowStockCount.toLocaleString();
      if (elVal) elVal.textContent = `$${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Category breakdown
      const catMap = {};
      this.inventory.forEach(inv => {
        const item = this.items.find(i => i.id === inv.item_id);
        const cat = item ? item.category || 'General' : 'General';
        catMap[cat] = (catMap[cat] || 0) + Number(inv.quantity);
      });

      const catContainer = document.getElementById('dashboard-category-breakdown');
      if (catContainer) {
        const entries = Object.entries(catMap);
        if (entries.length === 0) {
          catContainer.innerHTML = `<div class="form-hint" style="text-align:center; padding: 2rem;">No inventory records found.</div>`;
        } else {
          catContainer.innerHTML = entries.map(([cat, qty]) => {
            const percent = totalUnits > 0 ? Math.round((qty / totalUnits) * 100) : 0;
            return `
              <div style="margin-bottom: 0.85rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 4px;">
                  <span style="font-weight: 600;">${cat}</span>
                  <span style="color: var(--text-muted);">${qty.toLocaleString()} units (${percent}%)</span>
                </div>
                <div style="height: 8px; background: var(--bg-input); border-radius: 4px; overflow: hidden;">
                  <div style="width: ${percent}%; height: 100%; background: var(--primary); border-radius: 4px;"></div>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // Recent Activity Feed
      const actContainer = document.getElementById('dashboard-recent-activity');
      if (actContainer) {
        const recent = this.history.slice(0, 5);
        if (recent.length === 0) {
          actContainer.innerHTML = `<div class="form-hint" style="text-align:center; padding: 2rem;">No stock movements recorded yet.</div>`;
        } else {
          actContainer.innerHTML = recent.map(h => {
            const isAdd = h.action_type === 'ADD';
            const isSub = h.action_type === 'SUBTRACT';
            const badgeClass = isAdd ? 'badge-success' : isSub ? 'badge-danger' : 'badge-info';
            const timeAgo = this.formatTimeAgo(h.created_at);
            return `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle);">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                  <span class="badge ${badgeClass}">${h.action_type}</span>
                  <div>
                    <div style="font-weight: 600; font-size: 0.85rem;">${h.item_name} <span class="sku-tag">(${h.sku})</span></div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">${h.notes || 'Movement logged'} • By ${h.user_name}</div>
                  </div>
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 700; font-size: 0.85rem; color: ${isAdd ? 'var(--success)' : isSub ? 'var(--danger)' : 'var(--text-primary)'};">
                    ${isAdd ? '+' : ''}${h.qty_change}
                  </div>
                  <div style="font-size: 0.7rem; color: var(--text-muted);">${timeAgo}</div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    },

    // ==========================================
    // VIEW RENDERING: INVENTORY ON HAND
    // ==========================================
    renderInventoryTable() {
      const tbody = document.getElementById('inventory-table-body');
      if (!tbody) return;

      const searchTerm = (document.getElementById('inventory-search-input')?.value || '').toLowerCase().trim();
      const catFilter = document.getElementById('inventory-category-filter')?.value || '';
      const statusFilter = document.getElementById('inventory-status-filter')?.value || '';

      const filtered = this.inventory.filter(inv => {
        const item = this.items.find(i => i.id === inv.item_id);
        if (!item) return false;

        const matchesSearch = !searchTerm || 
          item.sku.toLowerCase().includes(searchTerm) || 
          item.name.toLowerCase().includes(searchTerm) || 
          inv.location.toLowerCase().includes(searchTerm);

        const matchesCat = !catFilter || item.category === catFilter;
        const matchesStatus = !statusFilter || inv.status === statusFilter;

        return matchesSearch && matchesCat && matchesStatus;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 2rem; color: var(--text-muted);">No inventory records found matching your filters.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(inv => {
        const item = this.items.find(i => i.id === inv.item_id) || { sku: 'Unknown', name: 'Unknown', category: 'General', sub_category: 'Standard', uom: 'EA', unit_cost: 0 };
        const extVal = (Number(inv.quantity) * Number(item.unit_cost)).toFixed(2);
        const statusBadge = inv.status === 'Available' ? 'badge-success' : inv.status === 'Low Stock' ? 'badge-warning' : 'badge-danger';

        return `
          <tr>
            <td><span class="sku-tag">${item.sku}</span></td>
            <td style="font-weight: 600;">${item.name}</td>
            <td><span class="badge badge-neutral">${item.category || 'General'}</span></td>
            <td><span class="badge badge-neutral" style="opacity: 0.85;">${item.sub_category || 'Standard'}</span></td>
            <td><span class="location-tag">${inv.location}</span></td>
            <td><strong style="font-size: 0.95rem;">${inv.quantity}</strong></td>
            <td><span style="font-size: 0.8rem; color: var(--text-muted);">${item.uom}</span></td>
            <td>$${Number(item.unit_cost).toFixed(2)}</td>
            <td><strong>$${extVal}</strong></td>
            <td><span class="badge ${statusBadge}">${inv.status}</span></td>
            <td>
              <div class="table-actions">
                <button class="action-btn" title="Quick Intake (+)" onclick="App.openQuickIntake('${inv.item_id}', '${inv.location}')">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14m-7-7h14"/></svg> +
                </button>
                <button class="action-btn" title="Quick Dispatch (-)" onclick="App.openQuickDispatch('${inv.item_id}', '${inv.location}', ${inv.quantity})">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/></svg> -
                </button>
                <button class="action-btn" title="Transfer Location" onclick="App.openTransferModal('${inv.item_id}', '${inv.location}', ${inv.quantity})">
                  ⇄
                </button>
                <button class="action-btn" title="Audit Count / Adjust" onclick="App.openAdjustModal('${inv.item_id}', '${inv.location}', ${inv.quantity})">
                  ⚙
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    },

    // ==========================================
    // VIEW RENDERING: ITEM CATALOG
    // ==========================================
    renderItemsTable() {
      const tbody = document.getElementById('items-table-body');
      if (!tbody) return;

      const searchTerm = (document.getElementById('items-search-input')?.value || '').toLowerCase().trim();
      const catFilter = document.getElementById('items-category-filter')?.value || '';

      const filtered = this.items.filter(item => {
        const matchesSearch = !searchTerm || 
          item.sku.toLowerCase().includes(searchTerm) || 
          item.name.toLowerCase().includes(searchTerm) ||
          (item.sub_category && item.sub_category.toLowerCase().includes(searchTerm));
        const matchesCat = !catFilter || item.category === catFilter;
        return matchesSearch && matchesCat;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">No catalog items found.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(item => {
        return `
          <tr>
            <td><span class="sku-tag">${item.sku}</span></td>
            <td style="font-weight: 600;">${item.name}</td>
            <td><span class="badge badge-neutral">${item.category || 'General'}</span></td>
            <td><span class="badge badge-neutral" style="opacity: 0.85;">${item.sub_category || 'Standard'}</span></td>
            <td>${item.uom}</td>
            <td>$${Number(item.unit_cost || 0).toFixed(2)}</td>
            <td><span style="font-weight: 600; color: var(--warning);">${item.reorder_point || 0}</span></td>
            <td>
              <div class="table-actions">
                <button class="action-btn" title="Edit SKU" onclick="App.openEditItemModal('${item.id}')">✏ Edit</button>
                <button class="action-btn" style="color: var(--danger);" title="Delete" onclick="App.handleDeleteItem('${item.id}')">🗑</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    },

    // ==========================================
    // VIEW RENDERING: AUDIT HISTORY
    // ==========================================
    renderHistoryTable() {
      const tbody = document.getElementById('history-table-body');
      if (!tbody) return;

      const searchTerm = (document.getElementById('history-search-input')?.value || '').toLowerCase().trim();
      const actionFilter = document.getElementById('history-action-filter')?.value || '';

      const filtered = this.history.filter(h => {
        const matchesSearch = !searchTerm ||
          h.sku.toLowerCase().includes(searchTerm) ||
          h.item_name.toLowerCase().includes(searchTerm) ||
          h.location.toLowerCase().includes(searchTerm) ||
          (h.notes && h.notes.toLowerCase().includes(searchTerm)) ||
          h.user_name.toLowerCase().includes(searchTerm);

        const matchesAction = !actionFilter || h.action_type === actionFilter;
        return matchesSearch && matchesAction;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">No transaction logs recorded.</td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map(h => {
        const isAdd = h.action_type === 'ADD';
        const isSub = h.action_type === 'SUBTRACT';
        const badgeClass = isAdd ? 'badge-success' : isSub ? 'badge-danger' : 'badge-info';
        const formattedDate = new Date(h.created_at).toLocaleString();

        return `
          <tr>
            <td style="font-size: 0.78rem; color: var(--text-secondary);">${formattedDate}</td>
            <td><span class="sku-tag">${h.sku}</span></td>
            <td style="font-weight: 600;">${h.item_name}</td>
            <td><span class="badge ${badgeClass}">${h.action_type}</span></td>
            <td>
              <strong style="color: ${isAdd ? 'var(--success)' : isSub ? 'var(--danger)' : 'var(--text-primary)'};">
                ${isAdd ? '+' : ''}${h.qty_change}
              </strong>
            </td>
            <td>${h.previous_qty}</td>
            <td>${h.new_qty}</td>
            <td><span class="location-tag">${h.location}</span></td>
            <td style="font-weight: 500;">${h.user_name}</td>
            <td style="font-size: 0.8rem; color: var(--text-secondary); max-width: 200px;">${h.notes || '-'}</td>
          </tr>
        `;
      }).join('');
    },

    // ==========================================
    // VIEW RENDERING: USERS & ROLES
    // ==========================================
    renderUsersTable() {
      const tbody = document.getElementById('users-table-body');
      if (!tbody) return;

      tbody.innerHTML = this.users.map(u => {
        const roleBadge = u.role === 'Admin' ? 'badge-danger' : u.role === 'Manager' ? 'badge-warning' : 'badge-info';
        return `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 0.65rem;">
                <div class="user-avatar" style="width:26px; height:26px; font-size:0.7rem;">${u.full_name.charAt(0)}</div>
                <strong style="font-size: 0.85rem;">${u.full_name}</strong>
              </div>
            </td>
            <td><code style="font-family: var(--font-mono);">${u.username}</code></td>
            <td style="color: var(--text-secondary);">${u.email || '-'}</td>
            <td><span class="badge ${roleBadge}">${u.role}</span></td>
            <td><span class="badge ${u.status === 'Active' ? 'badge-success' : 'badge-neutral'}">${u.status}</span></td>
            <td>
              <div class="table-actions">
                <button class="action-btn" onclick="App.openEditUserModal('${u.id}')">✏ Edit</button>
                <button class="action-btn" style="color: var(--danger);" onclick="App.handleDeleteUser('${u.id}')">🗑</button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    },

    // ==========================================
    // DROPDOWNS & FILTER OPTIONS POPULATOR
    // ==========================================
    populateDropdowns() {
      // Collect unique categories
      const categories = Array.from(new Set(this.items.map(i => i.category || 'General'))).sort();
      const catOptions = `<option value="">All Categories</option>` + categories.map(c => `<option value="${c}">${c}</option>`).join('');

      const invCatSelect = document.getElementById('inventory-category-filter');
      const itemCatSelect = document.getElementById('items-category-filter');
      if (invCatSelect) invCatSelect.innerHTML = catOptions;
      if (itemCatSelect) itemCatSelect.innerHTML = catOptions;

      // Populate item selects in modals
      const itemOptions = `<option value="">-- Select Catalog Item --</option>` + this.items.map(i => `<option value="${i.id}">${i.sku} - ${i.name}</option>`).join('');
      
      const intakeItemSelect = document.getElementById('intake-item-select');
      const dispatchItemSelect = document.getElementById('dispatch-item-select');
      const adjustItemSelect = document.getElementById('adjust-item-select');
      const transferItemSelect = document.getElementById('transfer-item-select');

      if (intakeItemSelect) intakeItemSelect.innerHTML = itemOptions;
      if (dispatchItemSelect) dispatchItemSelect.innerHTML = itemOptions;
      if (adjustItemSelect) adjustItemSelect.innerHTML = itemOptions;
      if (transferItemSelect) transferItemSelect.innerHTML = itemOptions;
    },

    // ==========================================
    // MODALS MANAGEMENT
    // ==========================================
    bindModals() {
      // Close on backdrop or close button
      document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal || e.target.closest('.btn-modal-close')) {
            this.closeModal(modal.id);
          }
        });
      });
    },

    openModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.add('active');
        const firstInput = modal.querySelector('input:not([type="hidden"]), select');
        if (firstInput) setTimeout(() => firstInput.focus(), 50);
      }
    },

    closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (modal) modal.classList.remove('active');
    },

    // Quick open modal helpers
    openQuickIntake(itemId = '', location = 'A-01-01') {
      const select = document.getElementById('intake-item-select');
      const locInput = document.getElementById('intake-location');
      const qtyInput = document.getElementById('intake-qty');
      const notesInput = document.getElementById('intake-notes');

      if (select && itemId) select.value = itemId;
      if (locInput) locInput.value = location;
      if (qtyInput) qtyInput.value = '';
      if (notesInput) notesInput.value = '';

      this.openModal('modal-intake');
    },

    openQuickDispatch(itemId = '', location = 'A-01-01', maxQty = 0) {
      const select = document.getElementById('dispatch-item-select');
      const locInput = document.getElementById('dispatch-location');
      const qtyInput = document.getElementById('dispatch-qty');
      const notesInput = document.getElementById('dispatch-notes');

      if (select && itemId) select.value = itemId;
      if (locInput) locInput.value = location;
      if (qtyInput) {
        qtyInput.value = '';
        qtyInput.max = maxQty;
      }
      if (notesInput) notesInput.value = '';

      this.openModal('modal-dispatch');
    },

    openAdjustModal(itemId = '', location = 'A-01-01', currentQty = 0) {
      const select = document.getElementById('adjust-item-select');
      const locInput = document.getElementById('adjust-location');
      const curInput = document.getElementById('adjust-current-qty');
      const actInput = document.getElementById('adjust-actual-qty');
      const reasonInput = document.getElementById('adjust-reason');

      if (select && itemId) select.value = itemId;
      if (locInput) locInput.value = location;
      if (curInput) curInput.value = currentQty;
      if (actInput) actInput.value = currentQty;
      if (reasonInput) reasonInput.value = '';

      this.openModal('modal-adjust');
    },

    openTransferModal(itemId = '', fromLocation = 'A-01-01', maxQty = 0) {
      const select = document.getElementById('transfer-item-select');
      const fromInput = document.getElementById('transfer-from-location');
      const toInput = document.getElementById('transfer-to-location');
      const qtyInput = document.getElementById('transfer-qty');
      const notesInput = document.getElementById('transfer-notes');

      if (select && itemId) select.value = itemId;
      if (fromInput) fromInput.value = fromLocation;
      if (toInput) toInput.value = '';
      if (qtyInput) {
        qtyInput.value = '';
        qtyInput.max = maxQty;
      }
      if (notesInput) notesInput.value = '';

      this.openModal('modal-transfer');
    },

    openNewItemModal() {
      const form = document.getElementById('form-item');
      if (form) form.reset();
      const idInput = document.getElementById('item-id');
      if (idInput) idInput.value = '';
      const title = document.getElementById('modal-item-title');
      if (title) title.textContent = 'Add New SKU to Catalog';
      this.openModal('modal-item');
    },

    openEditItemModal(itemId) {
      const item = this.items.find(i => i.id === itemId);
      if (!item) return;

      const form = document.getElementById('form-item');
      if (form) form.reset();

      document.getElementById('item-id').value = item.id;
      document.getElementById('item-sku').value = item.sku;
      document.getElementById('item-name').value = item.name;
      document.getElementById('item-category').value = item.category || 'General';
      document.getElementById('item-subcategory').value = item.sub_category || 'Standard';
      document.getElementById('item-uom').value = item.uom || 'EA';
      document.getElementById('item-cost').value = item.unit_cost || 0;
      document.getElementById('item-reorder').value = item.reorder_point || 0;

      const title = document.getElementById('modal-item-title');
      if (title) title.textContent = `Edit SKU: ${item.sku}`;

      this.openModal('modal-item');
    },

    openNewUserModal() {
      const form = document.getElementById('form-user');
      if (form) form.reset();
      document.getElementById('user-id').value = '';
      document.getElementById('modal-user-title').textContent = 'Add Team Member';
      this.openModal('modal-user');
    },

    openEditUserModal(userId) {
      const user = this.users.find(u => u.id === userId);
      if (!user) return;

      document.getElementById('user-id').value = user.id;
      document.getElementById('user-fullname').value = user.full_name;
      document.getElementById('user-username').value = user.username;
      document.getElementById('user-email').value = user.email || '';
      document.getElementById('user-role').value = user.role || 'Operator';
      document.getElementById('modal-user-title').textContent = `Edit Member: ${user.full_name}`;

      this.openModal('modal-user');
    },

    // ==========================================
    // FORMS SUBMISSION HANDLERS
    // ==========================================
    bindForms() {
      // 1. Catalog Item Form
      const formItem = document.getElementById('form-item');
      if (formItem) {
        formItem.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const itemData = {
              id: document.getElementById('item-id').value || undefined,
              sku: document.getElementById('item-sku').value.trim().toUpperCase(),
              name: document.getElementById('item-name').value.trim(),
              category: document.getElementById('item-category').value.trim() || 'General',
              sub_category: document.getElementById('item-subcategory').value.trim() || 'Standard',
              uom: document.getElementById('item-uom').value.trim() || 'EA',
              unit_cost: parseFloat(document.getElementById('item-cost').value) || 0,
              reorder_point: parseFloat(document.getElementById('item-reorder').value) || 0
            };

            await window.WMSDataService.upsertItem(itemData);
            this.closeModal('modal-item');
            this.showToast(`Saved SKU: ${itemData.sku}`, 'success');
            await this.refreshAllData();
          } catch (err) {
            this.showToast(`Error saving item: ${err.message}`, 'danger');
          }
        });
      }

      // 2. Stock Intake Form
      const formIntake = document.getElementById('form-intake');
      if (formIntake) {
        formIntake.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const itemId = document.getElementById('intake-item-select').value;
            const location = document.getElementById('intake-location').value.trim().toUpperCase();
            const qty = parseFloat(document.getElementById('intake-qty').value);
            const notes = document.getElementById('intake-notes').value.trim();

            if (!itemId || !location || isNaN(qty) || qty <= 0) {
              return this.showToast('Please specify item, location, and a valid quantity.', 'warning');
            }

            await window.WMSDataService.executeStockMovement({
              itemId,
              location,
              actionType: 'ADD',
              quantityChange: qty,
              notes: notes || 'Stock intake receipt'
            });

            this.closeModal('modal-intake');
            this.showToast(`Received +${qty} units into ${location}`, 'success');
            await this.refreshAllData();
          } catch (err) {
            this.showToast(`Intake error: ${err.message}`, 'danger');
          }
        });
      }

      // 3. Stock Dispatch Form
      const formDispatch = document.getElementById('form-dispatch');
      if (formDispatch) {
        formDispatch.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const itemId = document.getElementById('dispatch-item-select').value;
            const location = document.getElementById('dispatch-location').value.trim().toUpperCase();
            const qty = parseFloat(document.getElementById('dispatch-qty').value);
            const notes = document.getElementById('dispatch-notes').value.trim();

            if (!itemId || !location || isNaN(qty) || qty <= 0) {
              return this.showToast('Please specify item, location, and a valid quantity.', 'warning');
            }

            await window.WMSDataService.executeStockMovement({
              itemId,
              location,
              actionType: 'SUBTRACT',
              quantityChange: qty,
              notes: notes || 'Stock pick / dispatch order'
            });

            this.closeModal('modal-dispatch');
            this.showToast(`Dispatched -${qty} units from ${location}`, 'success');
            await this.refreshAllData();
          } catch (err) {
            this.showToast(`Dispatch error: ${err.message}`, 'danger');
          }
        });
      }

      // 4. Stock Adjust Form
      const formAdjust = document.getElementById('form-adjust');
      if (formAdjust) {
        formAdjust.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const itemId = document.getElementById('adjust-item-select').value;
            const location = document.getElementById('adjust-location').value.trim().toUpperCase();
            const actualQty = parseFloat(document.getElementById('adjust-actual-qty').value);
            const reason = document.getElementById('adjust-reason').value.trim();

            if (!itemId || !location || isNaN(actualQty) || actualQty < 0) {
              return this.showToast('Please provide valid count values.', 'warning');
            }

            await window.WMSDataService.executeStockMovement({
              itemId,
              location,
              actionType: 'ADJUST',
              quantityChange: actualQty,
              notes: `Cycle count reconciliation: ${reason || 'Physical audit'}`
            });

            this.closeModal('modal-adjust');
            this.showToast(`Adjusted stock count at ${location} to ${actualQty}`, 'success');
            await this.refreshAllData();
          } catch (err) {
            this.showToast(`Adjustment error: ${err.message}`, 'danger');
          }
        });
      }

      // 5. Stock Transfer Form
      const formTransfer = document.getElementById('form-transfer');
      if (formTransfer) {
        formTransfer.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const itemId = document.getElementById('transfer-item-select').value;
            const fromLocation = document.getElementById('transfer-from-location').value.trim().toUpperCase();
            const toLocation = document.getElementById('transfer-to-location').value.trim().toUpperCase();
            const qty = parseFloat(document.getElementById('transfer-qty').value);
            const notes = document.getElementById('transfer-notes').value.trim();

            if (!itemId || !fromLocation || !toLocation || isNaN(qty) || qty <= 0) {
              return this.showToast('Please complete all transfer fields.', 'warning');
            }

            await window.WMSDataService.transferStock({
              itemId,
              fromLocation,
              toLocation,
              quantity: qty,
              notes: notes || 'Inter-bay transfer'
            });

            this.closeModal('modal-transfer');
            this.showToast(`Transferred ${qty} units: ${fromLocation} ➔ ${toLocation}`, 'success');
            await this.refreshAllData();
          } catch (err) {
            this.showToast(`Transfer error: ${err.message}`, 'danger');
          }
        });
      }

      // 6. User Management Form
      const formUser = document.getElementById('form-user');
      if (formUser) {
        formUser.addEventListener('submit', async (e) => {
          e.preventDefault();
          try {
            const userData = {
              id: document.getElementById('user-id').value || undefined,
              full_name: document.getElementById('user-fullname').value.trim(),
              username: document.getElementById('user-username').value.trim().toLowerCase(),
              email: document.getElementById('user-email').value.trim(),
              role: document.getElementById('user-role').value,
              status: 'Active'
            };

            await window.WMSDataService.upsertUser(userData);
            this.closeModal('modal-user');
            this.showToast(`Saved user: ${userData.full_name}`, 'success');
            await this.refreshAllData();
          } catch (err) {
            this.showToast(`Error saving user: ${err.message}`, 'danger');
          }
        });
      }

      // 7. Supabase Settings Form
      const btnSaveSupabase = document.getElementById('btn-save-supabase');
      if (btnSaveSupabase) {
        btnSaveSupabase.addEventListener('click', () => {
          const url = document.getElementById('setting-supabase-url').value;
          const key = document.getElementById('setting-supabase-key').value;
          const res = window.WMSDataService.saveConfig(url, key);
          if (res.success) {
            this.showToast('Supabase configuration updated successfully!', 'success');
            this.updateSyncIndicator();
            this.refreshAllData();
          } else {
            this.showToast(`Failed: ${res.error}`, 'danger');
          }
        });
      }

      const btnTestSupabase = document.getElementById('btn-test-supabase');
      if (btnTestSupabase) {
        btnTestSupabase.addEventListener('click', async () => {
          const isLive = window.WMSDataService.isSupabaseConnected;
          if (isLive) {
            this.showToast('Supabase connection verified active and responsive!', 'success');
          } else {
            this.showToast('Currently running in local demo mode. Enter valid URL/Key to connect.', 'info');
          }
        });
      }

      // 8. Demo Reset Button
      const btnResetDemo = document.getElementById('btn-reset-demo-data');
      if (btnResetDemo) {
        btnResetDemo.addEventListener('click', () => {
          if (confirm('Are you sure you want to reset all demo inventory data to factory defaults?')) {
            window.WMSDataService.resetLocalSeed();
            this.showToast('Demo data restored to initial state.', 'info');
            this.refreshAllData();
          }
        });
      }
    },

    // ==========================================
    // GLOBAL ACTIONS & SEARCH SHORTCUTS
    // ==========================================
    bindGlobalActions() {
      // Global Search
      const searchInput = document.getElementById('global-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const val = e.target.value;
          const invSearch = document.getElementById('inventory-search-input');
          const itemSearch = document.getElementById('items-search-input');
          const histSearch = document.getElementById('history-search-input');

          if (invSearch) invSearch.value = val;
          if (itemSearch) itemSearch.value = val;
          if (histSearch) histSearch.value = val;

          this.renderInventoryTable();
          this.renderItemsTable();
          this.renderHistoryTable();
        });
      }

      // Filter Inputs Live Handlers
      ['inventory-search-input', 'inventory-category-filter', 'inventory-status-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => this.renderInventoryTable());
      });

      ['items-search-input', 'items-category-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => this.renderItemsTable());
      });

      ['history-search-input', 'history-action-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => this.renderHistoryTable());
      });

      // Export Buttons
      const btnExportInv = document.getElementById('btn-export-inventory');
      if (btnExportInv) {
        btnExportInv.addEventListener('click', () => {
          this.exportToCsv(this.inventory.map(inv => {
            const item = this.items.find(i => i.id === inv.item_id) || {};
            const extVal = (Number(inv.quantity) * Number(item.unit_cost || 0)).toFixed(2);
            return {
              SKU: item.sku || '',
              ItemName: item.name || '',
              Category: item.category || '',
              SubCategory: item.sub_category || '',
              Location: inv.location,
              Quantity: inv.quantity,
              UOM: item.uom || 'EA',
              UnitCost: item.unit_cost || 0,
              ExtendedValue: extVal,
              Status: inv.status
            };
          }), 'simpletory_inventory_export.csv');
        });
      }

      const btnExportItems = document.getElementById('btn-export-items');
      if (btnExportItems) {
        btnExportItems.addEventListener('click', () => {
          this.exportToCsv(this.items, 'simpletory_catalog_export.csv');
        });
      }

      const btnExportHist = document.getElementById('btn-export-history');
      if (btnExportHist) {
        btnExportHist.addEventListener('click', () => {
          this.exportToCsv(this.history, 'simpletory_history_export.csv');
        });
      }

      // Header Theme Toggle
      const themeBtn = document.getElementById('btn-toggle-theme');
      if (themeBtn) {
        themeBtn.addEventListener('click', () => this.toggleTheme());
      }
    },

    bindShortcuts() {
      window.addEventListener('keydown', (e) => {
        // Ignore shortcuts if in modal or form input
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
          if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
          }
          return;
        }

        if (e.key === '/') {
          e.preventDefault();
          const search = document.getElementById('global-search-input');
          if (search) search.focus();
        } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.openNewItemModal();
        } else if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.openQuickIntake();
        }
      });
    },

    async handleDeleteItem(itemId) {
      const item = this.items.find(i => i.id === itemId);
      if (!item) return;
      if (confirm(`Are you sure you want to delete SKU "${item.sku}"? This will also remove associated inventory records.`)) {
        await window.WMSDataService.deleteItem(itemId);
        this.showToast(`Deleted SKU: ${item.sku}`, 'info');
        await this.refreshAllData();
      }
    },

    async handleDeleteUser(userId) {
      const user = this.users.find(u => u.id === userId);
      if (!user) return;
      if (confirm(`Remove access for "${user.full_name}"?`)) {
        await window.WMSDataService.deleteUser(userId);
        this.showToast(`Removed member: ${user.full_name}`, 'info');
        await this.refreshAllData();
      }
    },

    // ==========================================
    // UTILITIES: TOASTS, CSV
    // ==========================================
    showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.innerHTML = `
        <div style="flex:1;">${message}</div>
        <button style="background:none; border:none; color:inherit; cursor:pointer; font-size:1rem;">×</button>
      `;

      toast.querySelector('button').addEventListener('click', () => toast.remove());
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    },

    exportToCsv(dataArray, filename) {
      if (!dataArray || dataArray.length === 0) {
        return this.showToast('No data available to export.', 'warning');
      }
      const headers = Object.keys(dataArray[0]);
      const csvRows = [
        headers.join(','),
        ...dataArray.map(row => headers.map(fieldName => JSON.stringify(row[fieldName] ?? '')).join(','))
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast(`Exported ${filename}`, 'success');
    },

    formatTimeAgo(isoString) {
      if (!isoString) return 'recently';
      const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      const mins = Math.floor(seconds / 60);
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    }
  };

  window.App = App;
  App.init();
});
