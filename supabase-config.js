/**
 * SIMPLETORY WMS - SUPABASE CLIENT & DATA ADAPTER
 * Seamlessly integrates live Supabase DB with automated fallback to localStorage demo store.
 */

(function (window) {
  const STORAGE_KEY_CONFIG = 'simpletory_supabase_config';
  const STORAGE_KEY_DATA = 'simpletory_local_db_v2';

  // Default Production Supabase Cloud Credentials (Auto-Connects on all devices)
  const DEFAULT_SUPABASE_URL = 'https://mmowezszhasjgixcifcu.supabase.co';
  const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tb3dlenN6aGFzamdpeGNpZmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Nzc1MzMsImV4cCI6MjEwNTE1MzUzM30.1vLz1v5n36aHj1S2tYcfKhdekgArZ9-KlK2pbmH8ANM';

  // Seed dataset mirroring supabase_schema.sql
  const INITIAL_SEED_DATA = {
    tenants: [
      { id: 'org-primary', name: 'Main Enterprise Warehouse', is_active: true, created_at: new Date().toISOString() },
      { id: 'org-east', name: 'East Coast Distribution Center', is_active: true, created_at: new Date().toISOString() }
    ],
    items: [
      { id: 'itm-1', tenant_id: 'org-primary', sku: 'SKU-1001', name: 'Standard Heavy Duty Pallet Box', category: 'Packaging', sub_category: 'Corrugated', uom: 'EA', unit_cost: 14.50, reorder_point: 20 },
      { id: 'itm-2', tenant_id: 'org-primary', sku: 'SKU-1002', name: 'Industrial Stretch Film Roll 80GA', category: 'Packaging', sub_category: 'Plastic Wrap', uom: 'RL', unit_cost: 22.00, reorder_point: 15 },
      { id: 'itm-3', tenant_id: 'org-primary', sku: 'SKU-2001', name: 'Heavy Duty Steel Bracket 4-Hole', category: 'Hardware', sub_category: 'Brackets', uom: 'EA', unit_cost: 3.75, reorder_point: 50 },
      { id: 'itm-4', tenant_id: 'org-primary', sku: 'SKU-3001', name: 'Premium Utility Knife Blades (Pack of 50)', category: 'Tools', sub_category: 'Blades', uom: 'PK', unit_cost: 8.90, reorder_point: 10 },
      { id: 'itm-5', tenant_id: 'org-primary', sku: 'SKU-4001', name: 'Poly Bubble Mailers #0 (6x10)', category: 'Packaging', sub_category: 'Envelopes', uom: 'CS', unit_cost: 32.40, reorder_point: 25 },
      { id: 'itm-6', tenant_id: 'org-primary', sku: 'SKU-5001', name: 'Direct Thermal Shipping Labels 4x6', category: 'Supplies', sub_category: 'Labels', uom: 'RL', unit_cost: 11.25, reorder_point: 30 }
    ],
    inventory: [
      { id: 'inv-1', tenant_id: 'org-primary', item_id: 'itm-1', location: 'A-01-01', quantity: 120, status: 'Available', updated_at: new Date().toISOString() },
      { id: 'inv-2', tenant_id: 'org-primary', item_id: 'itm-2', location: 'A-01-02', quantity: 45, status: 'Available', updated_at: new Date().toISOString() },
      { id: 'inv-3', tenant_id: 'org-primary', item_id: 'itm-3', location: 'B-02-01', quantity: 300, status: 'Available', updated_at: new Date().toISOString() },
      { id: 'inv-4', tenant_id: 'org-primary', item_id: 'itm-4', location: 'B-02-02', quantity: 8, status: 'Low Stock', updated_at: new Date().toISOString() },
      { id: 'inv-5', tenant_id: 'org-primary', item_id: 'itm-5', location: 'C-01-01', quantity: 64, status: 'Available', updated_at: new Date().toISOString() },
      { id: 'inv-6', tenant_id: 'org-primary', item_id: 'itm-6', location: 'C-02-01', quantity: 5, status: 'Low Stock', updated_at: new Date().toISOString() }
    ],
    inventory_history: [
      { id: 'hist-1', tenant_id: 'org-primary', item_id: 'itm-1', sku: 'SKU-1001', item_name: 'Standard Heavy Duty Pallet Box', action_type: 'ADD', qty_change: 120, previous_qty: 0, new_qty: 120, location: 'A-01-01', user_name: 'Derek Lumpkin', notes: 'Initial inventory intake', created_at: new Date(Date.now() - 3600000 * 24).toISOString() },
      { id: 'hist-2', tenant_id: 'org-primary', item_id: 'itm-2', sku: 'SKU-1002', item_name: 'Industrial Stretch Film Roll 80GA', action_type: 'ADD', qty_change: 45, previous_qty: 0, new_qty: 45, location: 'A-01-02', user_name: 'Derek Lumpkin', notes: 'PO-8821 Receipt', created_at: new Date(Date.now() - 3600000 * 18).toISOString() },
      { id: 'hist-3', tenant_id: 'org-primary', item_id: 'itm-3', sku: 'SKU-2001', item_name: 'Heavy Duty Steel Bracket 4-Hole', action_type: 'ADD', qty_change: 300, previous_qty: 0, new_qty: 300, location: 'B-02-01', user_name: 'Derek Lumpkin', notes: 'Bulk restock', created_at: new Date(Date.now() - 3600000 * 12).toISOString() },
      { id: 'hist-4', tenant_id: 'org-primary', item_id: 'itm-4', sku: 'SKU-3001', item_name: 'Premium Utility Knife Blades (Pack of 50)', action_type: 'SUBTRACT', qty_change: -2, previous_qty: 10, new_qty: 8, location: 'B-02-02', user_name: 'Derek Lumpkin', notes: 'Fulfillment Order #1042', created_at: new Date(Date.now() - 3600000 * 2).toISOString() }
    ],
    users: [
      { id: 'usr-admin-1', tenant_id: 'org-primary', username: 'derek', email: 'derek@simpletory.com', full_name: 'Derek Lumpkin', role: 'Superadmin', status: 'Active', created_at: new Date().toISOString() },
      { id: 'usr-mgr-1', tenant_id: 'org-primary', username: 'sarah.c', email: 'sarah@simpletory.com', full_name: 'Sarah Connor', role: 'Manager', status: 'Active', created_at: new Date().toISOString() },
      { id: 'usr-op-1', tenant_id: 'org-primary', username: 'mike.t', email: 'mike@simpletory.com', full_name: 'Mike Torres', role: 'User', status: 'Active', created_at: new Date().toISOString() }
    ]
  };

  class WMSDataService {
    constructor() {
      this.client = null;
      this.isSupabaseConnected = false;
      this.subscribers = [];
      this.activeTenantId = 'org-primary';
      this.currentUser = null; // Locked until authentication
      this.init();
    }

    init() {
      const savedConfig = this.getSavedConfig();
      const activeUrl = savedConfig?.url || DEFAULT_SUPABASE_URL;
      const activeKey = savedConfig?.key || DEFAULT_SUPABASE_ANON_KEY;

      if (activeUrl && activeKey && window.supabase) {
        try {
          this.client = window.supabase.createClient(activeUrl, activeKey);
          this.isSupabaseConnected = true;
          this.setupRealtimeListeners();
        } catch (e) {
          console.warn('Failed to initialize Supabase client, falling back to local DB:', e);
          this.isSupabaseConnected = false;
        }
      }

      // Initialize local storage seed if not present
      if (!localStorage.getItem(STORAGE_KEY_DATA)) {
        this.resetLocalSeed();
      }

      // Restore session if active
      const savedUser = this.getAuthenticatedUser();
      if (savedUser) {
        this.currentUser = savedUser;
        if (savedUser.tenant_id) this.activeTenantId = savedUser.tenant_id;
      }
    }

    getSavedConfig() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
        if (raw) return JSON.parse(raw);
        if (DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_ANON_KEY) {
          return { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_ANON_KEY };
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    saveConfig(url, key) {
      if (!url || !key) {
        localStorage.removeItem(STORAGE_KEY_CONFIG);
        this.client = null;
        this.isSupabaseConnected = false;
        return { success: true, mode: 'local' };
      }
      try {
        localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ url: url.trim(), key: key.trim() }));
        if (window.supabase) {
          this.client = window.supabase.createClient(url.trim(), key.trim());
          this.isSupabaseConnected = true;
          this.setupRealtimeListeners();
          return { success: true, mode: 'supabase' };
        }
        return { success: true, mode: 'configured' };
      } catch (err) {
        console.error('Supabase Config Error:', err);
        return { success: false, error: err.message };
      }
    }

    async testConnection() {
      if (!this.client) {
        return { success: false, message: 'No Supabase credentials configured.' };
      }
      try {
        const { data, error } = await this.client.from('tenants').select('id').limit(1);
        if (error) throw error;
        return { success: true, message: 'Supabase connection verified active and responsive!' };
      } catch (err) {
        return { success: false, message: `Connection failed: ${err.message}` };
      }
    }

    // ==========================================
    // AUTHENTICATION & SESSION MANAGEMENT
    // ==========================================
    async hashPassword(password) {
      if (!password) return '';
      try {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        return password; // Fallback in environments without WebCrypto
      }
    }

    async authenticateUser({ username, password, tenantId, remember = true }) {
      const cleanUsername = (username || '').trim().toLowerCase();
      const cleanPassword = (password || '').trim();

      if (!cleanUsername) {
        return { success: false, error: 'Please enter a valid username, email, or user ID.' };
      }
      if (!cleanPassword) {
        return { success: false, error: 'Please enter your password.' };
      }

      const targetTenantId = tenantId || this.activeTenantId;
      const hashedPassword = await this.hashPassword(cleanPassword);

      if (this.isSupabaseConnected && this.client) {
        try {
          // Query Supabase by username, email, or ID
          const { data: users, error } = await this.client
            .from('users')
            .select('*')
            .or(`username.ilike.${cleanUsername},email.ilike.${cleanUsername},id.eq.${cleanUsername}`);

          if (error) {
            console.error('Supabase auth query error:', error);
            return { success: false, error: `Database error: ${error.message}` };
          }

          if (!users || users.length === 0) {
            return { success: false, error: `User '${username}' not found in Supabase database. Please check username/email.` };
          }

          // If multiple facilities, match tenant or take primary
          const user = users.find(u => u.tenant_id === targetTenantId) || users[0];

          if (user.status === 'Suspended') {
            return { success: false, error: 'Account is suspended. Please contact your administrator.' };
          }

          // Check if associated tenant is active
          if (user.role !== 'Superadmin') {
            const allTenants = await this.getTenants(true);
            const userTenant = allTenants.find(t => t.id === user.tenant_id);
            if (userTenant && userTenant.is_active === false) {
              return { success: false, error: 'This facility / tenant account is inactive. Please contact your Superadmin.' };
            }
          }

          // 1. First-time initialization (if password_hash was NULL)
          if (!user.password_hash) {
            try {
              await this.client.from('users').update({ password_hash: hashedPassword }).eq('id', user.id);
            } catch (updateErr) {
              console.warn('Could not persist initial password hash to Supabase:', updateErr);
            }
            user.password_hash = hashedPassword;
            this.setCurrentUser(user, remember);
            return { success: true, user };
          }

          // 2. Exact match against stored SHA-256 hash
          if (user.password_hash === hashedPassword) {
            this.setCurrentUser(user, remember);
            return { success: true, user };
          }

          // 3. Plain-text password entered directly in database (auto-upgrade to SHA-256 hash)
          if (user.password_hash === cleanPassword) {
            try {
              await this.client.from('users').update({ password_hash: hashedPassword }).eq('id', user.id);
            } catch (upgradeErr) {
              console.warn('Could not upgrade plain-text password to hash:', upgradeErr);
            }
            user.password_hash = hashedPassword;
            this.setCurrentUser(user, remember);
            return { success: true, user };
          }

          return { success: false, error: 'Incorrect password entered.' };
        } catch (err) {
          console.error('Auth Exception:', err);
          return { success: false, error: `Authentication failed: ${err.message}` };
        }
      }

      // Local Store Fallback Authentication
      const db = this.getLocalDB();
      const user = (db.users || []).find(u => 
        (u.username && u.username.toLowerCase() === cleanUsername) ||
        (u.email && u.email.toLowerCase() === cleanUsername) ||
        (u.id && u.id.toLowerCase() === cleanUsername)
      );

      if (!user) {
        return { 
          success: false, 
          error: `User '${username}' not found in local store. Note: App is currently running in Offline/Local Mode because Supabase credentials are not connected on this browser.` 
        };
      }

      if (user.status === 'Suspended') {
        return { success: false, error: 'Account is suspended. Please contact your administrator.' };
      }

      // Check if associated tenant is active in local store
      if (user.role !== 'Superadmin') {
        const userTenant = (db.tenants || []).find(t => t.id === user.tenant_id);
        if (userTenant && userTenant.is_active === false) {
          return { success: false, error: 'This facility / tenant account is inactive. Please contact your Superadmin.' };
        }
      }

      if (!user.password_hash) {
        user.password_hash = hashedPassword;
        this.setCurrentUser(user, remember);
        return { success: true, user };
      }

      if (user.password_hash === hashedPassword || user.password_hash === cleanPassword) {
        user.password_hash = hashedPassword;
        this.setCurrentUser(user, remember);
        return { success: true, user };
      }

      return { success: false, error: 'Incorrect password entered.' };
    }

    // ==========================================
    // INACTIVITY TIMEOUT & SESSION MANAGEMENT
    // ==========================================
    recordActivity() {
      if (this.currentUser) {
        const now = Date.now().toString();
        localStorage.setItem('simpletory_last_activity', now);
        sessionStorage.setItem('simpletory_last_activity', now);
      }
    }

    isSessionTimedOut() {
      if (!this.currentUser) return false;
      const raw = localStorage.getItem('simpletory_last_activity') || sessionStorage.getItem('simpletory_last_activity');
      if (!raw) return false;
      const last = parseInt(raw, 10);
      const THIRTY_MINUTES = 30 * 60 * 1000;
      return (Date.now() - last) > THIRTY_MINUTES;
    }

    setCurrentUser(user, remember = true) {
      this.currentUser = user;
      if (user.tenant_id) {
        this.activeTenantId = user.tenant_id;
      }
      const sessionStr = JSON.stringify(user);
      sessionStorage.setItem('simpletory_session', sessionStr);
      if (remember) {
        localStorage.setItem('simpletory_session', sessionStr);
      } else {
        localStorage.removeItem('simpletory_session');
      }
      this.recordActivity();
      this.notifySubscribers('auth', user);
    }

    getAuthenticatedUser() {
      try {
        const raw = sessionStorage.getItem('simpletory_session') || localStorage.getItem('simpletory_session');
        if (!raw) return null;
        
        // Check 30-minute inactivity timeout
        const lastRaw = localStorage.getItem('simpletory_last_activity') || sessionStorage.getItem('simpletory_last_activity');
        if (lastRaw) {
          const last = parseInt(lastRaw, 10);
          if (Date.now() - last > (30 * 60 * 1000)) {
            this.logout();
            return null;
          }
        }
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }

    logout() {
      sessionStorage.removeItem('simpletory_session');
      localStorage.removeItem('simpletory_session');
      sessionStorage.removeItem('simpletory_last_activity');
      localStorage.removeItem('simpletory_last_activity');
      this.currentUser = null;
      this.notifySubscribers('auth', null);
    }

    resetLocalSeed() {
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(INITIAL_SEED_DATA));
      this.notifySubscribers('all');
    }

    getLocalDB() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_DATA);
        return raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(INITIAL_SEED_DATA));
      } catch (e) {
        return JSON.parse(JSON.stringify(INITIAL_SEED_DATA));
      }
    }

    setLocalDB(data) {
      localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(data));
      this.notifySubscribers('local');
    }

    // ==========================================
    // DATA ACCESS METHODS
    // ==========================================
    async getTenants(includeInactive = false) {
      if (this.isSupabaseConnected && this.client) {
        try {
          let query = this.client.from('tenants').select('*').order('name');
          if (!includeInactive) {
            query = query.or('is_active.eq.true,is_active.is.null');
          }
          const { data, error } = await query;
          if (!error && data) return data;
        } catch (e) {
          console.warn('Error fetching tenants from Supabase:', e);
        }
      }
      const db = this.getLocalDB();
      const allTenants = db.tenants || [];
      return includeInactive ? allTenants : allTenants.filter(t => t.is_active !== false);
    }

    async toggleTenantActive(tenantId, isActive) {
      if (this.isSupabaseConnected && this.client) {
        const { error } = await this.client.from('tenants').update({ is_active: isActive }).eq('id', tenantId);
        if (error) throw error;
        this.notifySubscribers('tenants');
        return true;
      }
      const db = this.getLocalDB();
      const idx = (db.tenants || []).findIndex(t => t.id === tenantId);
      if (idx >= 0) {
        db.tenants[idx].is_active = isActive;
        this.setLocalDB(db);
      }
      this.notifySubscribers('tenants');
      return true;
    }

    async upsertTenant(tenantData) {
      const tenant = {
        ...tenantData,
        id: tenantData.id || `org-${Date.now()}`,
        is_active: tenantData.is_active ?? true,
        created_at: tenantData.created_at || new Date().toISOString()
      };

      if (this.isSupabaseConnected && this.client) {
        const { data, error } = await this.client.from('tenants').upsert(tenant).select().single();
        if (error) throw error;
        this.notifySubscribers('tenants');
        return data;
      }

      const db = this.getLocalDB();
      const idx = (db.tenants || []).findIndex(t => t.id === tenant.id);
      if (idx >= 0) {
        db.tenants[idx] = { ...db.tenants[idx], ...tenant };
      } else {
        db.tenants.push(tenant);
      }
      this.setLocalDB(db);
      this.notifySubscribers('tenants');
      return tenant;
    }

    async getItems(tenantId = this.activeTenantId) {
      if (this.isSupabaseConnected && this.client) {
        const { data, error } = await this.client
          .from('items')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('name');
        if (!error && data) return data;
      }
      const db = this.getLocalDB();
      return (db.items || []).filter(item => item.tenant_id === tenantId);
    }

    async getInventory(tenantId = this.activeTenantId) {
      if (this.isSupabaseConnected && this.client) {
        const { data, error } = await this.client
          .from('inventory')
          .select('*')
          .eq('tenant_id', tenantId);
        if (!error && data) return data;
      }
      const db = this.getLocalDB();
      return (db.inventory || []).filter(inv => inv.tenant_id === tenantId);
    }

    async getHistory(tenantId = this.activeTenantId) {
      if (this.isSupabaseConnected && this.client) {
        const { data, error } = await this.client
          .from('inventory_history')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(100);
        if (!error && data) return data;
      }
      const db = this.getLocalDB();
      return (db.inventory_history || [])
        .filter(h => h.tenant_id === tenantId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    async getUsers(tenantId = this.activeTenantId) {
      if (this.isSupabaseConnected && this.client) {
        let query = this.client.from('users').select('*').order('full_name');
        if (tenantId && tenantId !== 'ALL') {
          query = query.eq('tenant_id', tenantId);
        }
        const { data, error } = await query;
        if (!error && data) return data;
      }
      const db = this.getLocalDB();
      if (!tenantId || tenantId === 'ALL') {
        return db.users || [];
      }
      return (db.users || []).filter(u => u.tenant_id === tenantId);
    }

    // ==========================================
    // MUTATION METHODS
    // ==========================================
    async upsertItem(itemData) {
      const item = {
        ...itemData,
        tenant_id: itemData.tenant_id || this.activeTenantId,
        id: itemData.id || `itm-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        created_at: itemData.created_at || new Date().toISOString()
      };

      if (this.isSupabaseConnected && this.client) {
        const { data, error } = await this.client.from('items').upsert(item).select().single();
        if (error) throw error;
        return data;
      }

      const db = this.getLocalDB();
      const existingIdx = db.items.findIndex(i => i.id === item.id || (i.sku === item.sku && i.tenant_id === item.tenant_id));
      if (existingIdx >= 0) {
        db.items[existingIdx] = { ...db.items[existingIdx], ...item };
      } else {
        db.items.push(item);
      }
      this.setLocalDB(db);
      return item;
    }

    async deleteItem(itemId) {
      if (this.isSupabaseConnected && this.client) {
        const { error } = await this.client.from('items').delete().eq('id', itemId);
        if (error) throw error;
        return true;
      }
      const db = this.getLocalDB();
      db.items = db.items.filter(i => i.id !== itemId);
      db.inventory = db.inventory.filter(inv => inv.item_id !== itemId);
      this.setLocalDB(db);
      return true;
    }

    async executeStockMovement({ itemId, location, actionType, quantityChange, notes }) {
      const tenantId = this.activeTenantId;
      const items = await this.getItems(tenantId);
      const targetItem = items.find(i => i.id === itemId);
      if (!targetItem) throw new Error('Item not found in catalog.');

      const inventories = await this.getInventory(tenantId);
      let invRecord = inventories.find(inv => inv.item_id === itemId && inv.location === location);

      const previousQty = invRecord ? Number(invRecord.quantity) : 0;
      let newQty = previousQty;

      if (actionType === 'ADD') {
        newQty = previousQty + Math.abs(Number(quantityChange));
      } else if (actionType === 'SUBTRACT') {
        newQty = Math.max(0, previousQty - Math.abs(Number(quantityChange)));
      } else if (actionType === 'ADJUST') {
        newQty = Math.max(0, Number(quantityChange));
      }

      const calculatedChange = newQty - previousQty;
      const status = newQty <= 0 ? 'Out of Stock' : newQty <= Number(targetItem.reorder_point) ? 'Low Stock' : 'Available';

      const updatedInv = {
        id: invRecord ? invRecord.id : `inv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenant_id: tenantId,
        item_id: itemId,
        location: location.trim().toUpperCase(),
        quantity: newQty,
        status: status,
        updated_at: new Date().toISOString()
      };

      const historyLog = {
        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        tenant_id: tenantId,
        item_id: itemId,
        sku: targetItem.sku,
        item_name: targetItem.name,
        action_type: actionType,
        qty_change: calculatedChange,
        previous_qty: previousQty,
        new_qty: newQty,
        location: location.trim().toUpperCase(),
        user_name: this.currentUser.full_name || 'Derek Lumpkin',
        notes: notes || `${actionType} operation executed`,
        created_at: new Date().toISOString()
      };

      if (this.isSupabaseConnected && this.client) {
        const { error: invErr } = await this.client.from('inventory').upsert(updatedInv);
        if (invErr) throw invErr;
        const { error: histErr } = await this.client.from('inventory_history').insert(historyLog);
        if (histErr) console.warn('History insert error:', histErr);
        return { inventory: updatedInv, history: historyLog };
      }

      const db = this.getLocalDB();
      const existingInvIdx = db.inventory.findIndex(inv => inv.id === updatedInv.id || (inv.item_id === itemId && inv.location === updatedInv.location && inv.tenant_id === tenantId));
      if (existingInvIdx >= 0) {
        db.inventory[existingInvIdx] = updatedInv;
      } else {
        db.inventory.push(updatedInv);
      }
      db.inventory_history.unshift(historyLog);
      this.setLocalDB(db);

      return { inventory: updatedInv, history: historyLog };
    }

    async transferStock({ itemId, fromLocation, toLocation, quantity, notes }) {
      const qty = Math.abs(Number(quantity));
      if (qty <= 0) throw new Error('Quantity must be greater than 0');
      if (fromLocation.trim().toUpperCase() === toLocation.trim().toUpperCase()) {
        throw new Error('Destination location must be different from source location.');
      }

      await this.executeStockMovement({
        itemId,
        location: fromLocation,
        actionType: 'SUBTRACT',
        quantityChange: qty,
        notes: `Transfer to ${toLocation.trim().toUpperCase()}: ${notes || ''}`
      });

      await this.executeStockMovement({
        itemId,
        location: toLocation,
        actionType: 'ADD',
        quantityChange: qty,
        notes: `Transfer from ${fromLocation.trim().toUpperCase()}: ${notes || ''}`
      });

      return true;
    }

    async upsertUser(userData) {
      const user = {
        ...userData,
        tenant_id: userData.tenant_id || this.activeTenantId,
        id: userData.id || `usr-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        created_at: userData.created_at || new Date().toISOString()
      };

      if (this.isSupabaseConnected && this.client) {
        const { data, error } = await this.client.from('users').upsert(user).select().single();
        if (error) throw error;
        this.notifySubscribers('users');
        return data;
      }

      const db = this.getLocalDB();
      const existingIdx = db.users.findIndex(u => u.id === user.id || (u.username === user.username && u.tenant_id === user.tenant_id));
      if (existingIdx >= 0) {
        db.users[existingIdx] = { ...db.users[existingIdx], ...user };
      } else {
        db.users.push(user);
      }
      this.setLocalDB(db);
      this.notifySubscribers('users');
      return user;
    }

    async deleteUser(userId) {
      if (this.isSupabaseConnected && this.client) {
        const { error } = await this.client.from('users').delete().eq('id', userId);
        if (error) throw error;
        this.notifySubscribers('users');
        return true;
      }
      const db = this.getLocalDB();
      db.users = db.users.filter(u => u.id !== userId);
      this.setLocalDB(db);
      this.notifySubscribers('users');
      return true;
    }

    async updateUserProfile(userId, { fullName, email, password }) {
      const updates = {};
      if (fullName) updates.full_name = fullName.trim();
      if (email) updates.email = email.trim();
      if (password && password.trim()) {
        updates.password_hash = await this.hashPassword(password.trim());
      }

      if (this.isSupabaseConnected && this.client) {
        const { data, error } = await this.client
          .from('users')
          .update(updates)
          .eq('id', userId)
          .select()
          .single();

        if (error) throw error;
        
        // Update currently authenticated user session
        if (this.currentUser && this.currentUser.id === userId) {
          this.currentUser = { ...this.currentUser, ...data };
          this.setCurrentUser(this.currentUser, true);
        }
        this.notifySubscribers('users');
        this.notifySubscribers('auth');
        return { success: true, user: data };
      }

      const db = this.getLocalDB();
      const idx = (db.users || []).findIndex(u => u.id === userId);
      if (idx >= 0) {
        db.users[idx] = { ...db.users[idx], ...updates };
        this.setLocalDB(db);
        if (this.currentUser && this.currentUser.id === userId) {
          this.currentUser = { ...this.currentUser, ...db.users[idx] };
          this.setCurrentUser(this.currentUser, true);
        }
        this.notifySubscribers('users');
        this.notifySubscribers('auth');
        return { success: true, user: db.users[idx] };
      }
      throw new Error('User account not found.');
    }

    // ==========================================
    // REALTIME & EVENT SUBSCRIBERS
    // ==========================================
    setupRealtimeListeners() {
      if (!this.client) return;
      try {
        const channel = this.client.channel('simpletory_live_channel');
        ['tenants', 'items', 'inventory', 'inventory_history', 'users'].forEach(table => {
          channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
            this.notifySubscribers(table, payload);
          });
        });
        channel.subscribe();
      } catch (err) {
        console.warn('Realtime subscription issue:', err);
      }
    }

    onDataChange(callback) {
      if (typeof callback === 'function') {
        this.subscribers.push(callback);
      }
    }

    notifySubscribers(table, payload = null) {
      this.subscribers.forEach(cb => {
        try { cb(table, payload); } catch (e) { console.error(e); }
      });
    }
  }

  // Expose global instance
  window.WMSDataService = new WMSDataService();
})(window);
