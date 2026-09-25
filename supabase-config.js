/**
 * SIMPLETORY WMS - SUPABASE CLIENT & DATA ADAPTER
 * Seamlessly integrates live Supabase DB with automated fallback to localStorage demo store.
 */

(function (window) {
  const STORAGE_KEY_CONFIG = 'simpletory_supabase_config';
  const STORAGE_KEY_DATA = 'simpletory_local_db_v2';

  // Config Constants (Editable via UI Settings or directly)
  const SUPABASE_URL = 'https://simpletory-demo.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_anon_public_key_ready';

  // Seed dataset mirroring supabase_schema.sql
  const INITIAL_SEED_DATA = {
    tenants: [
      { id: 'org-primary', name: 'Main Enterprise Warehouse', created_at: new Date().toISOString() },
      { id: 'org-east', name: 'East Coast Distribution Center', created_at: new Date().toISOString() }
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
      this.currentUser = { id: 'usr-admin-1', full_name: 'Derek Lumpkin', username: 'derek', role: 'Superadmin' };
      this.init();
    }

    init() {
      const savedConfig = this.getSavedConfig();
      if (savedConfig && savedConfig.url && savedConfig.key && window.supabase) {
        try {
          this.client = window.supabase.createClient(savedConfig.url, savedConfig.key);
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
    }

    getSavedConfig() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
        return raw ? JSON.parse(raw) : null;
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
    async getTenants() {
      if (this.isSupabaseConnected && this.client) {
        const { data, error } = await this.client.from('tenants').select('*').order('name');
        if (!error && data && data.length > 0) return data;
      }
      const db = this.getLocalDB();
      return db.tenants || [];
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
        const { data, error } = await this.client
          .from('users')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('full_name');
        if (!error && data) return data;
      }
      const db = this.getLocalDB();
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
      return user;
    }

    async deleteUser(userId) {
      if (this.isSupabaseConnected && this.client) {
        const { error } = await this.client.from('users').delete().eq('id', userId);
        if (error) throw error;
        return true;
      }
      const db = this.getLocalDB();
      db.users = db.users.filter(u => u.id !== userId);
      this.setLocalDB(db);
      return true;
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
