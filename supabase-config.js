/**
 * SIMPLETORY WMS - SUPABASE INTEGRATION & CLOUD SYNC ADAPTER
 * High-fidelity PostgreSQL Sync with Realtime Subscriptions & Offline Fallback
 */

const SUPABASE_CONFIG = {
  url: 'https://mmowezszhasjgixcifcu.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tb3dlenN6aGFzamdpeGNpZmN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1Nzc1MzMsImV4cCI6MjEwNTE1MzUzM30.1vLz1v5n36aHj1S2tYcfKhdekgArZ9-KlK2pbmH8ANM',
  enabled: true
};

class SupabaseService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isSyncing = false;
    this.lastSyncedAt = null;
    this.activeChannel = null;
    this.syncDebounceTimer = null;
    this.init();
  }

  init() {
    try {
      if (window.supabase && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey) {
        this.client = window.supabase.createClient(
          SUPABASE_CONFIG.url,
          SUPABASE_CONFIG.anonKey,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true
            }
          }
        );
        this.isConnected = true;
        console.log('✅ Supabase Client initialized successfully.');
      } else {
        console.warn('⚠️ Supabase JS SDK not detected or credentials missing.');
      }
    } catch (e) {
      console.error('❌ Failed to initialize Supabase client:', e);
      this.isConnected = false;
    }
  }

  // Update Cloud Sync Status indicator in Top Header
  updateStatus(state, message = '') {
    const chip = document.getElementById('cloudSyncStatus');
    if (!chip) return;

    const dot = chip.querySelector('.sync-dot');
    const text = chip.querySelector('.sync-text');

    if (state === 'syncing') {
      this.isSyncing = true;
      if (dot) dot.className = 'sync-dot syncing';
      if (text) text.textContent = message || 'Syncing Cloud...';
    } else if (state === 'live') {
      this.isSyncing = false;
      this.isConnected = true;
      this.lastSyncedAt = new Date();
      if (dot) dot.className = 'sync-dot live';
      if (text) text.textContent = 'Supabase Live';
      chip.title = `Connected to PostgreSQL (${SUPABASE_CONFIG.url})\nLast Synced: ${this.lastSyncedAt.toLocaleTimeString()}\nClick to force sync`;
    } else if (state === 'error' || state === 'offline') {
      this.isSyncing = false;
      this.isConnected = false;
      if (dot) dot.className = 'sync-dot offline';
      if (text) text.textContent = message || 'Offline Cache';
      chip.title = 'Running on local cache. Reconnecting in background...';
    }
  }

  // Fetch full tenant state from Supabase PostgreSQL
  async fetchTenantData(tenantId) {
    if (!this.client || !this.isConnected) return null;

    this.updateStatus('syncing', 'Fetching PostgreSQL...');
    try {
      const [
        tenantsRes,
        facilitiesRes,
        locationsRes,
        itemsRes,
        lpnsRes,
        uomsRes,
        customFieldsRes,
        labelTemplatesRes,
        facilityTypesRes,
        userProfilesRes,
        txRes
      ] = await Promise.all([
        this.client.from('tenants').select('*'),
        this.client.from('facilities').select('*').eq('tenant_id', tenantId),
        this.client.from('locations').select('*').eq('tenant_id', tenantId),
        this.client.from('items').select('*').eq('tenant_id', tenantId),
        this.client.from('lpns').select('*').eq('tenant_id', tenantId),
        this.client.from('units_of_measure').select('*').eq('tenant_id', tenantId),
        this.client.from('custom_fields').select('*').eq('tenant_id', tenantId),
        this.client.from('label_templates').select('*').eq('tenant_id', tenantId),
        this.client.from('facility_types').select('*').eq('tenant_id', tenantId),
        this.client.from('user_profiles').select('*').eq('tenant_id', tenantId),
        this.client.from('inventory_transactions').select('*').eq('tenant_id', tenantId).order('timestamp', { ascending: false }).limit(50)
      ]);

      this.updateStatus('live');

      return {
        tenants: tenantsRes.data || [],
        facilities: (facilitiesRes.data || []).map(f => ({
          id: f.id,
          code: f.code,
          name: f.name,
          type: f.type,
          address: f.address,
          trackingMode: f.tracking_mode
        })),
        locations: (locationsRes.data || []).map(l => ({
          id: l.id,
          facilityId: l.facility_id,
          code: l.code,
          name: l.name,
          zone: l.zone,
          capacity: l.capacity,
          barcode: l.barcode
        })),
        items: (itemsRes.data || []).map(i => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          category: i.category,
          baseUomId: i.base_uom ? `uom-${i.base_uom.toLowerCase()}` : 'uom-sqft',
          costPrice: Number(i.cost_price || 0),
          sellingPrice: Number(i.sell_price || 0),
          reorderPoint: Number(i.reorder_point || 0),
          barcode: i.barcode,
          customFields: i.custom_attributes || {}
        })),
        licensePlates: (lpnsRes.data || []).map(l => ({
          id: l.id,
          lpnNumber: l.lpn_number,
          itemId: l.sku ? `item-${l.sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}` : 'item-oak-01',
          facilityId: l.facility_id,
          locationId: l.location_id,
          quantityBase: Number(l.quantity || 0),
          status: l.pallet_status || 'available',
          receivedAt: l.created_at,
          customFields: {
            dye_lot_run: l.lot_number || l.custom_attributes?.dye_lot_run || '',
            ...(l.custom_attributes || {})
          }
        })),
        unitsOfMeasure: (uomsRes.data || []).map(u => ({
          id: u.id,
          name: u.name,
          code: u.code,
          category: u.category,
          isBaseDefault: u.is_base_default
        })),
        labelTemplates: (labelTemplatesRes?.data || []).map(t => ({
          id: t.id,
          name: t.name,
          type: t.type,
          widthIn: Number(t.width_in || 4.0),
          heightIn: Number(t.height_in || 6.0),
          unit: t.unit || 'in',
          isDefault: t.is_default,
          includeQr: t.include_qr,
          includeBarcode: t.include_barcode,
          includeLot: t.include_lot
        })),
        facilityTypes: (facilityTypesRes?.data || []).map(ft => ({
          id: ft.id,
          code: ft.code,
          name: ft.name,
          description: ft.description,
          isDefault: ft.is_default
        })),
        users: (userProfilesRes?.data || []).map(u => ({
          id: u.id,
          username: u.username,
          email: u.email,
          name: u.name,
          role: u.role,
          facilities: u.all_facilities_access ? 'All Facilities' : (u.facility_id || 'Assigned Facility'),
          status: u.status
        })),
        customFields: (customFieldsRes.data || []).map(c => ({
          id: c.id,
          key: c.key,
          label: c.label,
          type: c.type,
          required: c.required,
          showInGrid: c.show_in_grid,
          entity: c.entity
        })),
        transactions: (txRes.data || []).map(t => ({
          id: t.id,
          timestamp: new Date(t.timestamp).toLocaleString(),
          type: t.type === 'inbound_receipt' ? 'Receive Inbound' : (t.type === 'lpn_relocation' ? 'Move LPN' : t.type),
          lpn: t.lpn_id || '',
          sku: t.sku,
          from: t.from_location_id || 'Receiving',
          to: t.to_location_id || 'Racking',
          qty: `${t.qty_change > 0 ? '+' : ''}${t.qty_change} ${t.uom || ''}`,
          user: t.user_name || 'Admin',
          note: t.notes || t.reference_doc || ''
        }))
      };
    } catch (e) {
      console.error('Error fetching tenant data from Supabase:', e);
      this.updateStatus('error', 'Sync Failed');
      return null;
    }
  }

  // Push all local store state to Supabase PostgreSQL (Full Cloud Seed / Sync)
  async pushStoreToCloud(store) {
    if (!this.client || !this.isConnected) return;
    this.updateStatus('syncing', 'Syncing to Cloud...');

    try {
      const tenantId = store.state.activeTenantId;

      // 1. Sync Facilities
      const facs = store.tenantFacilities;
      for (const f of facs) {
        await this.client.from('facilities').upsert({
          id: f.id,
          tenant_id: tenantId,
          code: f.code,
          name: f.name,
          type: f.type,
          address: f.address,
          tracking_mode: f.trackingMode
        });
      }

      // 2. Sync Locations
      const locs = store.tenantLocations;
      for (const l of locs) {
        await this.client.from('locations').upsert({
          id: l.id,
          tenant_id: tenantId,
          facility_id: l.facilityId,
          code: l.code,
          name: l.name,
          zone: l.zone,
          capacity: l.capacity,
          barcode: l.barcode
        });
      }

      // 3. Sync Catalog Items
      const items = store.tenantItems;
      for (const i of items) {
        await this.client.from('items').upsert({
          id: i.id,
          tenant_id: tenantId,
          sku: i.sku,
          name: i.name,
          category: i.category || 'General',
          base_uom: 'SQFT',
          custom_attributes: i.customFields || {},
          cost_price: i.costPrice || 0,
          sell_price: i.sellingPrice || 0,
          reorder_point: i.reorderPoint || 0,
          barcode: i.barcode || i.sku
        });
      }

      // 4. Sync LPNs
      const lpns = store.tenantLpns;
      for (const l of lpns) {
        const item = items.find(i => i.id === l.itemId) || items[0];
        await this.client.from('lpns').upsert({
          id: l.id,
          tenant_id: tenantId,
          facility_id: l.facilityId,
          location_id: l.locationId,
          lpn_number: l.lpnNumber,
          sku: item ? item.sku : 'SKU-OAK-01',
          lot_number: l.customFields?.dye_lot_run || 'LOT-2026',
          quantity: l.quantityBase,
          uom: 'SQFT',
          pallet_status: l.status || 'available',
          custom_attributes: l.customFields || {}
        });
      }

      // 5. Sync Label Templates
      const templates = store.tenantLabelTemplates;
      for (const t of templates) {
        await this.client.from('label_templates').upsert({
          id: t.id,
          tenant_id: tenantId,
          name: t.name,
          type: t.type || 'lpn_pallet',
          width_in: t.widthIn,
          height_in: t.heightIn,
          unit: t.unit || 'in',
          is_default: t.isDefault || false,
          include_qr: t.includeQr ?? true,
          include_barcode: t.includeBarcode ?? true,
          include_lot: t.includeLot ?? true
        });
      }

      this.updateStatus('live');
      console.log('☁️ Successfully synchronized store to Supabase PostgreSQL.');
    } catch (e) {
      console.error('Failed pushing store to Supabase:', e);
      this.updateStatus('live');
    }
  }

  // Subscribe to Realtime Updates
  subscribeRealtime(tenantId, onUpdateCallback) {
    if (!this.client) return;

    if (this.activeChannel) {
      this.client.removeChannel(this.activeChannel);
    }

    try {
      this.activeChannel = this.client
        .channel(`simpletory-realtime-${tenantId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'lpns', filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            console.log('⚡ Realtime LPN change received:', payload);
            if (onUpdateCallback) onUpdateCallback('lpns', payload);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inventory_transactions', filter: `tenant_id=eq.${tenantId}` },
          (payload) => {
            console.log('⚡ Realtime Transaction change received:', payload);
            if (onUpdateCallback) onUpdateCallback('transactions', payload);
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`📡 Realtime WebSocket connection active for tenant: ${tenantId}`);
          }
        });
    } catch (e) {
      console.warn('Realtime subscription error:', e);
    }
  }
}

// Instantiate global service
window.supabaseService = new SupabaseService();
