/**
 * SIMPLETORY WMS v3.0 - MAIN APPLICATION LOGIC
 * Dynamic Reactive Multi-Tenant WMS Engine with UOM Hierarchy & Custom Field (UDF) Engine
 * Facility-Level & Dashboard-Level LPN vs Summary Mode Gating
 * Complete Inbound Receipt, LPN Relocation & Outbound Stock Adjustment / Job Dispatch
 */

// ============================================================================
// INITIAL MOCK DATABASE & DEFAULT SEED DATA
// ============================================================================
// ============================================================================
// INITIAL MOCK DATABASE & DEFAULT SEED DATA (CLEAN PRODUCTION FOUNDATION)
// ============================================================================
const DEFAULT_STORAGE_KEY = 'simpletory_wms_db_v4';

const INITIAL_DB = {
  activeTenantId: 'tenant-primary',
  activeFacilityId: 'fac-main-dc',
  inventoryMode: 'lpn', // 'lpn' or 'summary'
  theme: 'dark',

  // Tenants List (Clean Production Tenant)
  tenants: [
    {
      id: 'tenant-primary',
      name: 'Primary Enterprise Organization',
      slug: 'primary-org',
      template: 'general_wms',
      tier: 'Enterprise Tier',
      createdAt: '2026-09-01',
      adminUser: { name: 'Derek Lumpkin', email: 'derek@simpletory.com', role: 'Company Admin' }
    }
  ],

  // Tenant-Level Units of Measure (UOM)
  unitsOfMeasure: {
    'tenant-primary': [
      { id: 'uom-ea', name: 'Each / Unit', code: 'EA', category: 'count', isBaseDefault: true },
      { id: 'uom-cs', name: 'Case / Box', code: 'CS', category: 'count', isBaseDefault: false },
      { id: 'uom-plt', name: 'Pallet (PLT)', code: 'PLT', category: 'count', isBaseDefault: false },
      { id: 'uom-lbs', name: 'Pounds (Lbs)', code: 'LBS', category: 'weight', isBaseDefault: false },
      { id: 'uom-sqft', name: 'Square Feet', code: 'SQFT', category: 'area', isBaseDefault: false }
    ]
  },

  // Tenant-Level User-Defined Custom Fields (UDFs)
  customFields: {
    'tenant-primary': []
  },

  // Manageable Facility Types
  facilityTypes: {
    'tenant-primary': [
      { id: 'ftype-wh-main', code: 'warehouse', name: 'Main Warehouse / DC', description: 'Central distribution center with racking & docks', isDefault: true },
      { id: 'ftype-dock-main', code: 'cross_dock', name: 'Cross-Dock Terminal', description: 'Fast-turnaround transit sorting facility', isDefault: false },
      { id: 'ftype-fleet-main', code: 'mobile_van', name: 'Mobile Fleet Unit', description: 'Field vehicle / mobile installer', isDefault: false }
    ]
  },

  // Facilities with trackingMode: 'lpn' vs 'summary_only'
  facilities: {
    'tenant-primary': [
      { id: 'fac-main-dc', code: 'FAC-01', name: 'Central Distribution Center', type: 'warehouse', address: '100 Industrial Parkway', trackingMode: 'lpn' }
    ]
  },

  // Locations / Bins per Facility
  locations: {
    'tenant-primary': [
      { id: 'loc-rcv-01', facilityId: 'fac-main-dc', code: 'RCV-DOCK-1', name: 'Inbound Receiving Staging Dock', zone: 'receiving', capacity: 20, barcode: 'LOC-RCV-01' },
      { id: 'loc-a01-r01-a', facilityId: 'fac-main-dc', code: 'A01-R01-A', name: 'Aisle 1, Rack 1, Floor Bay', zone: 'racking', capacity: 4, barcode: 'LOC-A01-R01-A' },
      { id: 'loc-a01-r02-b', facilityId: 'fac-main-dc', code: 'A01-R02-B', name: 'Aisle 1, Rack 2, Level 2', zone: 'racking', capacity: 4, barcode: 'LOC-A01-R02-B' }
    ]
  },

  // Manufacturers & Suppliers
  manufacturers: {
    'tenant-primary': []
  },

  // Master Item Catalog
  items: {
    'tenant-primary': []
  },

  // Relational Item Units of Measure Subtable (`item_uoms`)
  itemUoms: {
    'tenant-primary': []
  },

  // License Plates (LPN Mode Inventory)
  licensePlates: {
    'tenant-primary': []
  },

  // Stock Movement Audit Log
  transactions: {
    'tenant-primary': []
  },

  // Manageable Label Configurations & Sizes
  labelTemplates: {
    'tenant-primary': [
      { id: 'lbl-4x6-pallet', name: 'Standard 4x6" Pallet LPN Tag', type: 'lpn_pallet', widthIn: 4.0, heightIn: 6.0, unit: 'in', isDefault: true, includeQr: true, includeBarcode: true, includeLot: true },
      { id: 'lbl-2x1-bin', name: 'Rack / Shelf Bin Marker (2x1")', type: 'bin_location', widthIn: 2.0, heightIn: 1.0, unit: 'in', isDefault: true, includeQr: false, includeBarcode: true, includeLot: false },
      { id: 'lbl-3x1-sku', name: 'Item Carton Barcode (3x1")', type: 'item_sku', widthIn: 3.0, heightIn: 1.0, unit: 'in', isDefault: true, includeQr: false, includeBarcode: true, includeLot: false },
      { id: 'lbl-85x11-sheet', name: 'Packing Sheet & Dispatch Slip (8.5x11")', type: 'dispatch_slip', widthIn: 8.5, heightIn: 11.0, unit: 'in', isDefault: false, includeQr: true, includeBarcode: true, includeLot: true }
    ]
  },

  // Users & Access Control (Universal Generic Roles with Username & Email Dual-Auth)
  users: {
    'tenant-primary': [
      { id: 'usr-1', username: 'derek', email: 'derek@simpletory.com', password: null, name: 'Derek Lumpkin', role: 'Master Admin', facilities: 'All Facilities', status: 'Active' }
    ]
  },

  currentAuthUser: null
};

// ============================================================================
// STATE STORE WITH LOCAL STORAGE PERSISTENCE
// ============================================================================
class SimpletoryStore {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      // Clear legacy storage keys from previous demo iterations
      ['simpletory_wms_db', 'simpletory_wms_db_v1', 'simpletory_wms_db_v2', 'simpletory_wms_db_v3', 'simpletory_db'].forEach(k => {
        try { localStorage.removeItem(k); } catch (e) {}
      });

      const saved = localStorage.getItem(DEFAULT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Clean out legacy demo tenants if present
        if (parsed.tenants && parsed.tenants.some(t => t.id === 'tenant-flooring' || t.id === 'tenant-general' || t.name?.includes('Apex') || t.name?.includes('Cascade'))) {
          localStorage.removeItem(DEFAULT_STORAGE_KEY);
          return JSON.parse(JSON.stringify(INITIAL_DB));
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Could not read from localStorage, using clean initial state.', e);
    }
    return JSON.parse(JSON.stringify(INITIAL_DB));
  }

  save() {
    try {
      localStorage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(this.state));
      // Debounced background sync to Supabase PostgreSQL
      if (window.supabaseService && window.supabaseService.isConnected) {
        clearTimeout(this._cloudSyncTimer);
        this._cloudSyncTimer = setTimeout(() => {
          window.supabaseService.pushStoreToCloud(this);
        }, 1500);
      }
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }

  get activeTenant() {
    return this.state.tenants?.find(t => t.id === this.state.activeTenantId) || this.state.tenants?.[0] || {
      id: 'tenant-primary',
      name: 'Primary Enterprise Organization',
      slug: 'primary-org',
      template: 'general_wms',
      tier: 'Enterprise Tier'
    };
  }

  get currentUser() {
    return this.state.currentAuthUser || null;
  }

  get tenantUoms() {
    return this.state.unitsOfMeasure?.[this.state.activeTenantId] || [];
  }

  get tenantLabelTemplates() {
    if (!this.state.labelTemplates) {
      this.state.labelTemplates = JSON.parse(JSON.stringify(INITIAL_DB.labelTemplates));
    }
    if (!this.state.labelTemplates[this.state.activeTenantId]) {
      this.state.labelTemplates[this.state.activeTenantId] = JSON.parse(JSON.stringify(INITIAL_DB.labelTemplates['tenant-primary'] || []));
    }
    return this.state.labelTemplates[this.state.activeTenantId] || [];
  }

  get tenantCustomFields() {
    return this.state.customFields[this.state.activeTenantId] || [];
  }

  get tenantFacilities() {
    return this.state.facilities[this.state.activeTenantId] || [];
  }

  get tenantLocations() {
    return this.state.locations[this.state.activeTenantId] || [];
  }

  get tenantManufacturers() {
    return this.state.manufacturers[this.state.activeTenantId] || [];
  }

  get tenantItems() {
    return this.state.items[this.state.activeTenantId] || [];
  }

  get tenantItemUoms() {
    return this.state.itemUoms?.[this.state.activeTenantId] || [];
  }

  getItemUoms(itemId) {
    const list = this.tenantItemUoms.filter(u => u.itemId === itemId);
    if (list.length === 0) {
      // Return a synthesized base unit if not found
      const item = this.tenantItems.find(i => i.id === itemId);
      const baseUom = item ? this.tenantUoms.find(u => u.id === item.baseUomId) : null;
      return [{
        id: `iuom-auto-${itemId}`,
        itemId: itemId,
        uomId: item?.baseUomId || 'uom-sqft',
        tierLevel: 1,
        tierName: baseUom?.name || 'Base Unit',
        multiplier: 1,
        barcode: `${item?.sku || 'SKU'}-BASE`,
        isBase: true,
        description: `1 ${baseUom?.code || 'Unit'}`
      }];
    }
    return list.sort((a, b) => a.multiplier - b.multiplier);
  }

  getItemBaseUom(itemId) {
    const item = this.tenantItems.find(i => i.id === itemId);
    if (!item) return { name: 'Unit', code: 'EA' };
    return this.tenantUoms.find(u => u.id === item.baseUomId) || { name: 'Unit', code: 'EA' };
  }

  getItemPackagingChain(itemId) {
    const uoms = this.getItemUoms(itemId);
    const item = this.tenantItems.find(i => i.id === itemId);
    const baseUom = this.getItemBaseUom(itemId);
    const baseCode = baseUom?.code || 'SQFT';

    if (uoms.length <= 1) {
      return `1 Base Unit = 1 ${baseCode}`;
    }

    const highest = uoms[uoms.length - 1];
    const middle = uoms.length > 2 ? uoms[1] : null;

    if (middle && highest) {
      const midUnitsInHigh = Math.round(highest.multiplier / middle.multiplier);
      const midUomDef = this.tenantUoms.find(u => u.id === middle.uomId);
      const highUomDef = this.tenantUoms.find(u => u.id === highest.uomId);
      return `1 ${highUomDef?.code || 'PLT'} = ${midUnitsInHigh} ${midUomDef?.code || 'BOX'} = ${highest.multiplier.toLocaleString()} ${baseCode}`;
    }

    if (highest) {
      const highUomDef = this.tenantUoms.find(u => u.id === highest.uomId);
      return `1 ${highUomDef?.code || 'PLT'} = ${highest.multiplier.toLocaleString()} ${baseCode}`;
    }

    return `1 Base Unit = 1 ${baseCode}`;
  }

  addItemUom(itemId, data) {
    if (!this.state.itemUoms) {
      this.state.itemUoms = {};
    }
    if (!this.state.itemUoms[this.state.activeTenantId]) {
      this.state.itemUoms[this.state.activeTenantId] = [];
    }

    const tenantUomsList = this.state.itemUoms[this.state.activeTenantId];
    const existingForSku = tenantUomsList.filter(u => u.itemId === itemId);
    const newTierLevel = existingForSku.length + 1;

    const uomDef = this.tenantUoms.find(u => u.id === data.uomId);

    const newRecord = {
      id: `iuom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      itemId: itemId,
      uomId: data.uomId,
      tierLevel: newTierLevel,
      tierName: uomDef ? uomDef.name : 'Custom Unit',
      multiplier: Number(data.multiplier) || 1,
      barcode: data.barcode || `${itemId}-${uomDef?.code || 'UOM'}`,
      isBase: Number(data.multiplier) === 1,
      description: data.description || `${data.multiplier} base units`
    };

    tenantUomsList.push(newRecord);
    this.save();
    return newRecord;
  }

  deleteItemUom(itemUomId) {
    if (!this.state.itemUoms || !this.state.itemUoms[this.state.activeTenantId]) return false;
    const list = this.state.itemUoms[this.state.activeTenantId];
    const idx = list.findIndex(u => u.id === itemUomId);
    if (idx !== -1) {
      const target = list[idx];
      const allForSku = list.filter(u => u.itemId === target.itemId);
      // Prevent deleting if it's the only tier left
      if (allForSku.length <= 1) {
        return false;
      }
      list.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  get tenantLpns() {
    return this.state.licensePlates[this.state.activeTenantId] || [];
  }

  get tenantTransactions() {
    return this.state.transactions[this.state.activeTenantId] || [];
  }

  get tenantUsers() {
    return this.state.users[this.state.activeTenantId] || [];
  }

  get tenantFacilityTypes() {
    if (!this.state.facilityTypes) {
      this.state.facilityTypes = JSON.parse(JSON.stringify(INITIAL_DB.facilityTypes));
    }
    if (!this.state.facilityTypes[this.state.activeTenantId]) {
      this.state.facilityTypes[this.state.activeTenantId] = JSON.parse(JSON.stringify(INITIAL_DB.facilityTypes[this.state.activeTenantId] || []));
    }
    return this.state.facilityTypes[this.state.activeTenantId];
  }
}

const store = new SimpletoryStore();

// ============================================================================
// UOM HIERARCHY & CONVERSION HELPER ENGINE
// ============================================================================
const UomEngine = {
  convert(item, qty, inputUomIdentifier = 'base') {
    if (!item) return { baseUnits: 0, fullCases: 0, looseRemainders: 0, fullPallets: 0, tiers: [] };

    const itemUoms = store.getItemUoms(item.id);
    let baseUnits = 0;

    // Determine how many base units this quantity represents
    if (inputUomIdentifier === 'base') {
      baseUnits = Number(qty) || 0;
    } else {
      // Find matching item_uom by id, uomId, or keyword (case, pallet)
      const match = itemUoms.find(u => 
        u.id === inputUomIdentifier || 
        u.uomId === inputUomIdentifier ||
        u.tierName.toLowerCase().includes(inputUomIdentifier.toLowerCase()) ||
        u.uomId.toLowerCase().includes(inputUomIdentifier.toLowerCase())
      );

      if (match) {
        baseUnits = (Number(qty) || 0) * match.multiplier;
      } else {
        baseUnits = Number(qty) || 0;
      }
    }

    baseUnits = Number(baseUnits.toFixed(2));

    // Calculate packaging breakdown across tiers
    const caseTier = itemUoms.find(u => u.multiplier > 1 && u.multiplier < (itemUoms[itemUoms.length - 1]?.multiplier || 999999)) || itemUoms[1] || itemUoms[0];
    const palletTier = itemUoms[itemUoms.length - 1] || caseTier;

    const caseMultiplier = caseTier ? caseTier.multiplier : 1;
    const palletMultiplier = (palletTier && caseMultiplier > 0) ? Number((palletTier.multiplier / caseMultiplier).toFixed(2)) : 1;
    const eachesPerPallet = palletTier ? palletTier.multiplier : caseMultiplier;

    const fullCases = Math.floor(baseUnits / caseMultiplier);
    const looseRemainders = Number((baseUnits % caseMultiplier).toFixed(2));
    const fullPallets = palletTier ? Number((baseUnits / palletTier.multiplier).toFixed(2)) : 0;

    return {
      baseUnits,
      fullCases,
      looseRemainders,
      fullPallets,
      caseMultiplier,
      palletMultiplier,
      eachesPerPallet,
      itemUoms
    };
  },

  formatPackagingBadge(item, baseUnits) {
    if (!item) return `${baseUnits}`;
    const uoms = store.getItemUoms(item.id);
    const baseUom = store.getItemBaseUom(item.id);
    const uomName = baseUom?.code || 'SQFT';

    if (uoms.length <= 1) {
      return `${baseUnits.toLocaleString()} ${uomName}`;
    }

    const topTier = uoms[uoms.length - 1];
    const midTier = uoms.length > 2 ? uoms[1] : null;

    if (topTier && topTier.multiplier > 1 && baseUnits >= topTier.multiplier) {
      const topCount = Math.floor(baseUnits / topTier.multiplier);
      const rem = baseUnits % topTier.multiplier;
      const topCode = store.tenantUoms.find(u => u.id === topTier.uomId)?.code || 'PLT';

      if (rem === 0) {
        return `${topCount} ${topCode} (${baseUnits.toLocaleString()} ${uomName})`;
      } else if (midTier && midTier.multiplier > 1) {
        const midCount = Math.floor(rem / midTier.multiplier);
        const looseRem = Number((rem % midTier.multiplier).toFixed(2));
        const midCode = store.tenantUoms.find(u => u.id === midTier.uomId)?.code || 'BOX';
        if (looseRem === 0) {
          return `${topCount} ${topCode}, ${midCount} ${midCode} (${baseUnits.toLocaleString()} ${uomName})`;
        } else {
          return `${topCount} ${topCode}, ${midCount} ${midCode} + ${looseRem} ${uomName} (${baseUnits.toLocaleString()} ${uomName})`;
        }
      } else {
        return `${topCount} ${topCode} + ${rem.toLocaleString()} ${uomName}`;
      }
    }

    if (midTier && midTier.multiplier > 1 && baseUnits >= midTier.multiplier) {
      const midCount = Math.floor(baseUnits / midTier.multiplier);
      const looseRem = Number((baseUnits % midTier.multiplier).toFixed(2));
      const midCode = store.tenantUoms.find(u => u.id === midTier.uomId)?.code || 'BOX';
      if (looseRem === 0) {
        return `${midCount} ${midCode} (${baseUnits.toLocaleString()} ${uomName})`;
      } else {
        return `${midCount} ${midCode} + ${looseRem} ${uomName} (${baseUnits.toLocaleString()} ${uomName})`;
      }
    }

    return `${baseUnits.toLocaleString()} ${uomName}`;
  }
};

// ============================================================================
// UI CONTROLLER & RENDERING ENGINE
// ============================================================================
class SimpletoryApp {
  constructor() {
    this.initElements();
    this.bindEvents();
    this.checkAuthSession();
    this.renderAll();
    this.initIcons();
    this.initCloudSync();
  }

  checkAuthSession() {
    if (!store.state.currentAuthUser) {
      this.openModal('authModal');
    } else if (!store.state.currentAuthUser.password) {
      this.openChangePasswordModal(store.state.currentAuthUser.id, true);
      this.showToast(`Welcome, ${store.state.currentAuthUser.name}! Please set your account password to continue.`, 'info');
    }
  }

  initElements() {
    // Top Bar Selectors
    this.globalFacilitySelect = document.getElementById('globalFacilitySelect');
    this.headerModeChipContainer = document.getElementById('headerModeChipContainer');
    this.headerModePillToggle = document.getElementById('headerModePillToggle');
    this.headerModeLpnBtn = document.getElementById('headerModeLpnBtn');
    this.headerModeSummaryBtn = document.getElementById('headerModeSummaryBtn');
    this.headerLockedSummaryBadge = document.getElementById('headerLockedSummaryBadge');

    this.tenantSelect = document.getElementById('tenantSelect');
    this.themeToggleBtn = document.getElementById('themeToggleBtn');
    this.themeIcon = document.getElementById('themeIcon');
    this.sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    this.sidebar = document.getElementById('sidebar');
    this.quickScanBtn = document.getElementById('quickScanBtn');
    this.mobileScanFab = document.getElementById('mobileScanFab');

    // Dashboard Mode Controls
    this.dashModeToggleWrapper = document.getElementById('dashModeToggleWrapper');
    this.dashModeLpnBtn = document.getElementById('dashModeLpnBtn');
    this.dashModeSummaryBtn = document.getElementById('dashModeSummaryBtn');
    this.dashLockedSummaryBadge = document.getElementById('dashLockedSummaryBadge');

    // Navigation & Views
    this.navItems = document.querySelectorAll('.nav-item, .mobile-nav-item');
    this.views = document.querySelectorAll('.app-view');

    // Inventory Controls
    this.viewToggleLpn = document.getElementById('viewToggleLpn');
    this.viewToggleSummary = document.getElementById('viewToggleSummary');
    this.lpnModeContainer = document.getElementById('lpnModeContainer');
    this.summaryModeContainer = document.getElementById('summaryModeContainer');
    this.inventorySearchInput = document.getElementById('inventorySearchInput');
    this.filterFacilitySelect = document.getElementById('filterFacilitySelect');
    this.filterCategorySelect = document.getElementById('filterCategorySelect');
    this.filterStatusSelect = document.getElementById('filterStatusSelect');
    this.inventoryModeBadge = document.getElementById('inventoryModeBadge');

    // Item Detail & UOM Subpage Elements
    this.itemDetailBreadcrumbSku = document.getElementById('itemDetailBreadcrumbSku');
    this.itemDetailTitle = document.getElementById('itemDetailTitle');
    this.itemDetailSubtitle = document.getElementById('itemDetailSubtitle');
    this.itemDetailCategoryBadge = document.getElementById('itemDetailCategoryBadge');
    this.itemDetailMetaGrid = document.getElementById('itemDetailMetaGrid');
    this.itemUomsRelationalTableBody = document.getElementById('itemUomsRelationalTableBody');
    this.itemDetailVisualChain = document.getElementById('itemDetailVisualChain');
    this.itemSimQtyInput = document.getElementById('itemSimQtyInput');
    this.itemSimUomSelect = document.getElementById('itemSimUomSelect');
    this.itemSimBaseUnits = document.getElementById('itemSimBaseUnits');
    this.itemSimBaseUnitName = document.getElementById('itemSimBaseUnitName');
    this.itemSimFullTiers = document.getElementById('itemSimFullTiers');
    this.itemSimTierDetails = document.getElementById('itemSimTierDetails');
    this.itemSimCalloutText = document.getElementById('itemSimCalloutText');
    this.addTierInlineBox = document.getElementById('addTierInlineBox');
    this.btnShowAddTierForm = document.getElementById('btnShowAddTierForm');
    this.btnCancelAddTier = document.getElementById('btnCancelAddTier');
    this.addItemUomForm = document.getElementById('addItemUomForm');
    this.activeDetailItemId = store.tenantItems[0]?.id || null;

    // Toast Container
    this.toastContainer = document.getElementById('toastContainer');
  }

  initIcons() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  async initCloudSync() {
    const cloudBadge = document.getElementById('cloudSyncStatus');
    if (cloudBadge) {
      cloudBadge.addEventListener('click', async () => {
        this.showToast('Triggering manual Supabase Cloud Sync...', 'info');
        await this.syncWithCloud(true);
      });
    }

    if (window.supabaseService && window.supabaseService.isConnected) {
      await this.syncWithCloud();
      // Setup Realtime websocket listener for live collaboration
      window.supabaseService.subscribeRealtime(store.state.activeTenantId, (table, payload) => {
        this.showToast(`⚡ Realtime update synced from Supabase (${table})`, 'info');
        this.renderAll();
      });
    }
  }

  async syncWithCloud(force = false) {
    if (!window.supabaseService || !window.supabaseService.isConnected) return;
    try {
      // If Master Admin, sync all tenants and user profiles platform-wide
      if (this.isMasterAdmin()) {
        const [allTenantsSummary, allProfiles] = await Promise.all([
          window.supabaseService.fetchAllTenantsSummary(),
          window.supabaseService.fetchAllUserProfiles()
        ]);

        if (allTenantsSummary && allTenantsSummary.length > 0) {
          allTenantsSummary.forEach(rt => {
            const existing = store.state.tenants.find(t => t.id === rt.id);
            if (existing) {
              existing.name = rt.name;
              existing.slug = rt.slug;
              existing.template = rt.template;
              existing.tier = rt.tier;
            } else {
              store.state.tenants.push({
                id: rt.id,
                name: rt.name,
                slug: rt.slug,
                template: rt.template,
                tier: rt.tier,
                adminUser: {
                  name: rt.adminName,
                  email: rt.adminEmail,
                  role: 'Company Admin'
                }
              });
            }
          });
        }

        if (allProfiles && allProfiles.length > 0) {
          allProfiles.forEach(u => {
            const tId = u.tenantId || 'tenant-primary';
            if (!store.state.users[tId]) store.state.users[tId] = [];
            const idx = store.state.users[tId].findIndex(ex => ex.id === u.id || (ex.email && ex.email === u.email) || (ex.username && ex.username === u.username));
            if (idx >= 0) {
              store.state.users[tId][idx] = { ...store.state.users[tId][idx], ...u };
            } else {
              store.state.users[tId].push(u);
            }
          });
        }
      }

      const remoteData = await window.supabaseService.fetchTenantData(store.state.activeTenantId);
      if (remoteData && (remoteData.facilities.length > 0 || remoteData.items.length > 0 || (remoteData.users && remoteData.users.length > 0))) {
        if (remoteData.facilities.length > 0) store.state.facilities[store.state.activeTenantId] = remoteData.facilities;
        if (remoteData.locations.length > 0) store.state.locations[store.state.activeTenantId] = remoteData.locations;
        if (remoteData.items.length > 0) store.state.items[store.state.activeTenantId] = remoteData.items;
        if (remoteData.licensePlates.length > 0) store.state.licensePlates[store.state.activeTenantId] = remoteData.licensePlates;
        if (remoteData.unitsOfMeasure.length > 0) store.state.unitsOfMeasure[store.state.activeTenantId] = remoteData.unitsOfMeasure;
        if (remoteData.customFields.length > 0) store.state.customFields[store.state.activeTenantId] = remoteData.customFields;
        if (remoteData.transactions.length > 0) store.state.transactions[store.state.activeTenantId] = remoteData.transactions;
        if (remoteData.users && remoteData.users.length > 0) store.state.users[store.state.activeTenantId] = remoteData.users;
        store.save();
        this.renderAll();
        if (force) this.showToast('✅ Supabase data refreshed and synced!', 'success');
      } else {
        // Initial cloud seed if tables are empty
        await window.supabaseService.pushStoreToCloud(store);
        if (force) this.showToast('☁️ Seeded initial store to Supabase PostgreSQL!', 'success');
      }
    } catch (e) {
      console.warn('Cloud sync error:', e);
    }
  }

  isCurrentFacilityLpnEnabled() {
    const activeFacId = store.state.activeFacilityId;
    if (!activeFacId || activeFacId === 'all') {
      return store.tenantFacilities.some(f => f.trackingMode === 'lpn');
    }
    const currentFac = store.tenantFacilities.find(f => f.id === activeFacId);
    return currentFac ? currentFac.trackingMode === 'lpn' : true;
  }

  isMasterAdmin() {
    const activeUser = store.currentUser || store.activeTenant?.adminUser;
    if (!activeUser) return false;
    const role = (activeUser.role || '').toLowerCase();
    const email = (activeUser.email || '').toLowerCase();
    const username = (activeUser.username || '').toLowerCase();
    return role === 'master admin' || role === 'super admin' || role === 'global admin' || email === 'derek@simpletory.com' || username === 'derek';
  }

  bindEvents() {
    // Navigation routing
    this.navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const viewId = item.getAttribute('data-view');
        this.navigateTo(viewId);
        if (window.innerWidth <= 768) {
          this.sidebar.classList.remove('open');
        }
      });
    });

    // Theme Toggle
    this.themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      store.state.theme = newTheme;
      store.save();
      this.themeIcon.setAttribute('data-lucide', newTheme === 'dark' ? 'sun' : 'moon');
      this.initIcons();
      this.showToast(`Switched to ${newTheme} theme`, 'info');
    });

    // Sidebar Mobile Toggle
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.addEventListener('click', () => {
        this.sidebar.classList.toggle('open');
      });
    }

    // Tenant Switcher
    this.tenantSelect.addEventListener('change', async (e) => {
      const selected = e.target.value;
      if (selected === '__NEW_TENANT__') {
        this.tenantSelect.value = store.state.activeTenantId;
        this.openModal('provisionTenantModal');
        return;
      }
      store.state.activeTenantId = selected;
      const facilities = store.tenantFacilities;
      if (facilities.length > 0) {
        store.state.activeFacilityId = facilities[0].id;
      }
      store.save();
      this.renderAll();
      this.showToast(`Switched to organization: ${store.activeTenant.name}`, 'success');
      if (window.supabaseService && window.supabaseService.isConnected) {
        await this.syncWithCloud();
        window.supabaseService.subscribeRealtime(store.state.activeTenantId, (table, payload) => {
          this.renderAll();
        });
      }
    });

    // Facility Switcher
    this.globalFacilitySelect.addEventListener('change', (e) => {
      store.state.activeFacilityId = e.target.value;
      store.save();
      this.renderAll();
      this.showToast(`Active facility set to ${e.target.options[e.target.selectedIndex].text}`, 'info');
    });

    // Inventory & Dashboard View Mode Toggle Helper
    const setInventoryMode = (mode) => {
      if (!this.isCurrentFacilityLpnEnabled() && mode === 'lpn') {
        this.showToast('This facility is locked in Admin to Summary Only mode.', 'warning');
        return;
      }
      store.state.inventoryMode = mode;
      store.save();
      this.updateInventoryModeUI();
      this.renderDashboard();
      this.renderInventory();
    };

    // Header Mode Buttons
    this.headerModeLpnBtn?.addEventListener('click', () => setInventoryMode('lpn'));
    this.headerModeSummaryBtn?.addEventListener('click', () => setInventoryMode('summary'));

    // Dashboard Mode Buttons
    this.dashModeLpnBtn?.addEventListener('click', () => setInventoryMode('lpn'));
    this.dashModeSummaryBtn?.addEventListener('click', () => setInventoryMode('summary'));

    // Inventory View Mode Buttons
    this.viewToggleLpn?.addEventListener('click', () => setInventoryMode('lpn'));
    this.viewToggleSummary?.addEventListener('click', () => setInventoryMode('summary'));

    // Inventory Search & Filters
    [this.inventorySearchInput, this.filterFacilitySelect, this.filterCategorySelect, this.filterStatusSelect].forEach(el => {
      if (el) el.addEventListener('input', () => this.renderInventory());
    });

    // Item Detail & Packaging UOMs Event Listeners
    if (this.btnShowAddTierForm) {
      this.btnShowAddTierForm.addEventListener('click', () => {
        const isHidden = this.addTierInlineBox.style.display === 'none';
        this.addTierInlineBox.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          const item = store.tenantItems.find(i => i.id === this.activeDetailItemId);
          document.getElementById('addTierSkuLabel').textContent = item ? item.sku : 'SKU';
          document.getElementById('addTierItemId').value = this.activeDetailItemId;
          const uomSelect = document.getElementById('addTierUomSelect');
          if (uomSelect) {
            uomSelect.innerHTML = store.tenantUoms.map(u => `
              <option value="${u.id}">${u.name} (${u.code})</option>
            `).join('');
          }
          const baseUom = store.getItemBaseUom(this.activeDetailItemId);
          document.getElementById('addTierMultiplierHelper').textContent = `How many ${baseUom?.code || 'Base Units'} are in this packaging unit?`;
        }
      });
    }

    if (this.btnCancelAddTier) {
      this.btnCancelAddTier.addEventListener('click', () => {
        this.addTierInlineBox.style.display = 'none';
      });
    }

    if (this.addItemUomForm) {
      this.addItemUomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = document.getElementById('addTierItemId').value || this.activeDetailItemId;
        const uomId = document.getElementById('addTierUomSelect').value;
        const multiplier = parseFloat(document.getElementById('addTierMultiplier').value) || 1;
        const barcode = document.getElementById('addTierBarcode').value.trim();
        const description = document.getElementById('addTierDesc').value.trim();

        store.addItemUom(itemId, {
          uomId,
          multiplier,
          barcode,
          description
        });

        this.addTierInlineBox.style.display = 'none';
        this.addItemUomForm.reset();
        this.renderItemDetail(itemId);
        this.renderItemsMaster();
        this.showToast(`Packaging tier added to item_uoms table`, 'success');
      });
    }

    // SKU Simulator input listeners
    if (this.itemSimQtyInput) {
      this.itemSimQtyInput.addEventListener('input', () => this.updateItemSimCalculator());
    }
    if (this.itemSimUomSelect) {
      this.itemSimUomSelect.addEventListener('change', () => this.updateItemSimCalculator());
    }

    // Item Detail Action Buttons
    document.getElementById('btnItemDetailReceive')?.addEventListener('click', () => {
      this.triggerReceiveForItem(this.activeDetailItemId);
    });
    document.getElementById('btnItemDetailAdjust')?.addEventListener('click', () => {
      this.triggerAdjustForItem(this.activeDetailItemId);
    });

    // Quick Action Bar in Dashboard
    document.getElementById('stripReceiveBtn')?.addEventListener('click', () => this.openModal('receiveStockModal'));
    document.getElementById('stripMoveBtn')?.addEventListener('click', () => this.openModal('moveLpnModal'));
    document.getElementById('stripPickBtn')?.addEventListener('click', () => this.triggerDispatchForItem());
    document.getElementById('stripItemCatalogBtn')?.addEventListener('click', () => this.navigateTo('items'));
    document.getElementById('stripCustomFieldsBtn')?.addEventListener('click', () => this.navigateTo('tenant-settings'));

    document.getElementById('btnQuickReceiveFromDash')?.addEventListener('click', () => this.openModal('receiveStockModal'));
    document.getElementById('btnQuickMoveFromDash')?.addEventListener('click', () => this.openModal('moveLpnModal'));
    document.getElementById('btnReceiveInbound')?.addEventListener('click', () => this.openModal('receiveStockModal'));
    document.getElementById('btnDispatchInventory')?.addEventListener('click', () => this.triggerDispatchForItem());
    document.getElementById('btnAdjustInventory')?.addEventListener('click', () => this.triggerAdjustForItem());
    document.getElementById('btnAddNewItem')?.addEventListener('click', () => this.openModal('addItemModal'));
    document.getElementById('btnAddFacilityModalBtn')?.addEventListener('click', () => this.openModal('addFacilityModal'));
    document.getElementById('btnAddFacilityQuick')?.addEventListener('click', () => this.openModal('addFacilityModal'));
    document.getElementById('btnAddNewFacility')?.addEventListener('click', () => this.openModal('addFacilityModal'));
    document.getElementById('btnAddNewFacilityType')?.addEventListener('click', () => this.openModal('addFacilityTypeModal'));
    document.getElementById('btnAddNewUom')?.addEventListener('click', () => this.openModal('addUomModal'));
    document.getElementById('btnAddLocationModalBtn')?.addEventListener('click', () => this.openModal('addLocationModal'));
    document.getElementById('btnAddManufacturerModalBtn')?.addEventListener('click', () => this.openModal('addManufacturerModal'));
    document.getElementById('btnInviteUserModal')?.addEventListener('click', () => this.openInviteUserModal());
    document.getElementById('userOrgFilterSelect')?.addEventListener('change', () => this.renderUsers());
    document.getElementById('btnAddNewLabelTemplate')?.addEventListener('click', () => this.openModal('addLabelTemplateModal'));
    document.getElementById('btnEditCustomFieldsLink')?.addEventListener('click', () => this.navigateTo('tenant-settings'));
    document.getElementById('btnViewAllMovements')?.addEventListener('click', () => this.navigateTo('operations'));
    document.getElementById('btnOpenProvisionTenantModal')?.addEventListener('click', () => this.openModal('provisionTenantModal'));
    document.getElementById('btnRefreshMasterTenants')?.addEventListener('click', () => {
      this.renderMasterTenants();
      this.showToast('Client organizations refreshed.', 'info');
    });

    // User Profile Pill & Dropdown Menu
    const userProfBtn = document.getElementById('userProfileBtn');
    const userDrop = document.getElementById('userMenuDropdown');
    userProfBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      userDrop?.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!userDrop?.contains(e.target) && !userProfBtn?.contains(e.target)) {
        userDrop?.classList.remove('open');
      }
    });
    document.getElementById('btnUserMenuSwitchAccount')?.addEventListener('click', () => {
      userDrop?.classList.remove('open');
      this.openModal('authModal');
    });
    document.getElementById('btnUserMenuPlatformAdmin')?.addEventListener('click', () => {
      userDrop?.classList.remove('open');
      this.navigateTo('master-tenants');
    });
    document.getElementById('btnUserMenuSettings')?.addEventListener('click', () => {
      userDrop?.classList.remove('open');
      this.navigateTo('tenant-settings');
    });
    document.getElementById('btnUserMenuChangePassword')?.addEventListener('click', () => {
      userDrop?.classList.remove('open');
      this.openChangePasswordModal();
    });
    document.getElementById('btnUserMenuSignOut')?.addEventListener('click', () => {
      userDrop?.classList.remove('open');
      this.logout();
    });

    // Invite User Modal Mode Toggle (Email vs Username)
    const btnEmailMode = document.getElementById('btnModeEmailInvite');
    const btnUserMode = document.getElementById('btnModeUsernamePass');
    const emailGrp = document.getElementById('inviteEmailGroup');
    const userGrp = document.getElementById('inviteUsernameGroup');
    const emailInp = document.getElementById('inviteUserEmail');
    const userInp = document.getElementById('inviteUserUsername');
    const passInp = document.getElementById('inviteUserPassword');

    btnEmailMode?.addEventListener('click', () => {
      btnEmailMode.classList.add('active');
      btnUserMode?.classList.remove('active');
      if (emailGrp) emailGrp.style.display = 'block';
      if (userGrp) userGrp.style.display = 'none';
      if (emailInp) emailInp.required = true;
      if (userInp) userInp.required = false;
      if (passInp) passInp.required = false;
    });

    btnUserMode?.addEventListener('click', () => {
      btnUserMode?.classList.add('active');
      btnEmailMode?.classList.remove('active');
      if (emailGrp) emailGrp.style.display = 'none';
      if (userGrp) userGrp.style.display = 'grid';
      if (emailInp) emailInp.required = false;
      if (userInp) userInp.required = true;
      if (passInp) passInp.required = true;
    });

    // Barcode Scanner & Quick Scan Buttons
    this.quickScanBtn?.addEventListener('click', () => this.openScannerModal());
    if (this.mobileScanFab) {
      this.mobileScanFab.addEventListener('click', () => this.openScannerModal());
    }
    document.getElementById('btnSubmitManualScan')?.addEventListener('click', () => {
      const val = document.getElementById('manualScanInput')?.value;
      if (val) this.processBarcodeScan(val);
    });
    document.getElementById('manualScanInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = document.getElementById('manualScanInput')?.value;
        if (val) this.processBarcodeScan(val);
      }
    });

    // Printing Actions & Controls
    document.getElementById('btnPrintPalletLabelsQuick')?.addEventListener('click', () => this.openPrintLabelModal('lpn'));
    document.getElementById('btnTriggerPrint')?.addEventListener('click', () => this.executePrintLabels());
    ['printTemplateSelect', 'printTargetSelect', 'printCopiesCount', 'printOptBarcode', 'printOptQr', 'printOptLot', 'printOptThermalMode'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.renderLiveLabelPreview());
      document.getElementById(id)?.addEventListener('input', () => this.renderLiveLabelPreview());
    });

    // CSV Master Data Importer & Exporter Actions
    document.getElementById('btnImportInventoryCsv')?.addEventListener('click', () => this.openCsvImportModal('lpns'));
    document.getElementById('btnExportInventoryCsv')?.addEventListener('click', () => this.exportCsv('lpns'));
    document.getElementById('btnImportCatalogCsv')?.addEventListener('click', () => this.openCsvImportModal('items'));
    document.getElementById('btnExportCatalogCsv')?.addEventListener('click', () => this.exportCsv('items'));
    document.getElementById('btnDownloadSampleCsv')?.addEventListener('click', () => {
      const target = document.getElementById('csvImportTarget')?.value || 'items';
      this.downloadSampleCsv(target);
    });
    document.getElementById('csvImportTarget')?.addEventListener('change', (e) => {
      this.clearCsvFile();
    });
    document.getElementById('btnExecuteCsvImport')?.addEventListener('click', () => this.executeCsvImport());
    document.getElementById('btnClearCsvFile')?.addEventListener('click', () => this.clearCsvFile());

    // CSV File Drag & Drop Handlers
    const csvFileInput = document.getElementById('csvFileInput');
    const csvDropZone = document.getElementById('csvDropZone');
    csvFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleCsvFile(e.target.files[0]);
      }
    });
    csvDropZone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      csvDropZone.classList.add('dragover');
    });
    csvDropZone?.addEventListener('dragleave', () => {
      csvDropZone.classList.remove('dragover');
    });
    csvDropZone?.addEventListener('drop', (e) => {
      e.preventDefault();
      csvDropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.handleCsvFile(e.dataTransfer.files[0]);
      }
    });

    // Modal Close Buttons
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close-modal');
        this.closeModal(modalId);
      });
    });

    // Form Submissions
    this.bindFormHandlers();
  }

  bindFormHandlers() {
    // 1. Receive Inbound Stock Form
    const rcvForm = document.getElementById('receiveStockForm');
    if (rcvForm) {
      const updateRcvPreview = () => {
        const itemSelect = document.getElementById('rcvItemSelect');
        const qtyInput = document.getElementById('rcvQuantityInput');
        const uomSelect = document.getElementById('rcvUomSelect');
        const previewText = document.getElementById('rcvRollupText');

        const item = store.tenantItems.find(i => i.id === itemSelect.value);
        if (!item) return;

        const qty = parseFloat(qtyInput.value) || 0;
        const uomTierId = uomSelect.value;
        const conv = UomEngine.convert(item, qty, uomTierId);
        const baseUom = store.getItemBaseUom(item.id);
        const itemUoms = store.getItemUoms(item.id);
        const selectedTier = itemUoms.find(u => u.id === uomTierId) || itemUoms[0];
        const packagingBadge = UomEngine.formatPackagingBadge(item, conv.baseUnits);

        previewText.textContent = `Receiving ${qty} × ${selectedTier ? selectedTier.tierName : 'Unit'} = ${conv.baseUnits.toLocaleString()} ${baseUom?.code || 'Units'} (${packagingBadge})`;
      };

      document.getElementById('rcvItemSelect')?.addEventListener('change', () => {
        this.populateRcvUoms();
        updateRcvPreview();
      });
      document.getElementById('rcvQuantityInput')?.addEventListener('input', updateRcvPreview);
      document.getElementById('rcvUomSelect')?.addEventListener('change', updateRcvPreview);

      rcvForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = document.getElementById('rcvItemSelect').value;
        const facilityId = document.getElementById('rcvFacilitySelect').value;
        const locationId = document.getElementById('rcvLocationSelect').value;
        const inputQty = parseFloat(document.getElementById('rcvQuantityInput').value);
        const inputUom = document.getElementById('rcvUomSelect').value;

        const item = store.tenantItems.find(i => i.id === itemId);
        const conv = UomEngine.convert(item, inputQty, inputUom);

        // Gather dynamic UDFs
        const customFieldValues = {};
        store.tenantCustomFields.forEach(udf => {
          const inputEl = document.getElementById(`rcv_udf_${udf.key}`);
          if (inputEl) {
            customFieldValues[udf.key] = inputEl.value;
          }
        });

        // Generate LPN
        const nextLpnNum = `LPN-${Math.floor(100000 + Math.random() * 900000)}`;
        const newLpn = {
          id: `lpn-${Date.now()}`,
          lpnNumber: nextLpnNum,
          itemId,
          facilityId,
          locationId,
          quantityBase: conv.baseUnits,
          status: 'available',
          receivedAt: new Date().toISOString(),
          customFields: customFieldValues
        };

        if (!store.state.licensePlates[store.state.activeTenantId]) {
          store.state.licensePlates[store.state.activeTenantId] = [];
        }
        store.state.licensePlates[store.state.activeTenantId].unshift(newLpn);

        // Log Transaction
        const locObj = store.tenantLocations.find(l => l.id === locationId);
        const facObj = store.tenantFacilities.find(f => f.id === facilityId);
        const newTx = {
          id: `tx-${Date.now().toString().slice(-4)}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
          type: 'Receive Inbound',
          lpn: nextLpnNum,
          sku: item.sku,
          from: 'Inbound PO',
          to: `${facObj ? facObj.code : ''} / ${locObj ? locObj.code : ''}`,
          qty: `+${conv.baseUnits.toLocaleString()} Base Units (${conv.fullCases} Cases)`,
          user: store.activeTenant.adminUser.name,
          note: 'Stock Inbound Receipt'
        };

        if (!store.state.transactions[store.state.activeTenantId]) {
          store.state.transactions[store.state.activeTenantId] = [];
        }
        store.state.transactions[store.state.activeTenantId].unshift(newTx);

        store.save();
        this.closeModal('receiveStockModal');
        this.renderAll();
        this.showToast(`Received ${item.sku} into License Plate ${nextLpnNum}!`, 'success');
      });
    }

    // 2. Relocate LPN Form
    const moveForm = document.getElementById('moveLpnForm');
    if (moveForm) {
      document.getElementById('moveLpnSelect')?.addEventListener('change', (e) => {
        const lpn = store.tenantLpns.find(l => l.id === e.target.value);
        const previewEl = document.getElementById('moveLpnPreviewCard');
        if (lpn) {
          const item = store.tenantItems.find(i => i.id === lpn.itemId);
          const currentLoc = store.tenantLocations.find(loc => loc.id === lpn.locationId);
          previewEl.innerHTML = `
            <div style="font-size:0.8rem; line-height:1.4;">
              <div><strong>LPN:</strong> <span class="font-mono text-primary">${lpn.lpnNumber}</span> (${item ? item.sku : ''})</div>
              <div><strong>Current Bin:</strong> ${currentLoc ? currentLoc.name : 'Unassigned'} (${currentLoc ? currentLoc.code : ''})</div>
              <div><strong>Quantity:</strong> ${lpn.quantityBase.toLocaleString()} Units</div>
            </div>
          `;
        }
      });

      moveForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const lpnId = document.getElementById('moveLpnSelect').value;
        const destFacilityId = document.getElementById('moveDestFacilitySelect').value;
        const destLocationId = document.getElementById('moveDestLocationSelect').value;
        const reason = document.getElementById('moveReasonInput').value || 'Relocation';

        const lpn = store.tenantLpns.find(l => l.id === lpnId);
        if (!lpn) return;

        const fromLoc = store.tenantLocations.find(l => l.id === lpn.locationId);
        const toLoc = store.tenantLocations.find(l => l.id === destLocationId);
        const toFac = store.tenantFacilities.find(f => f.id === destFacilityId);
        const item = store.tenantItems.find(i => i.id === lpn.itemId);

        lpn.facilityId = destFacilityId;
        lpn.locationId = destLocationId;

        const newTx = {
          id: `tx-${Date.now().toString().slice(-4)}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
          type: 'Move LPN',
          lpn: lpn.lpnNumber,
          sku: item ? item.sku : 'N/A',
          from: fromLoc ? fromLoc.code : 'Prior Bin',
          to: `${toFac ? toFac.code : ''} / ${toLoc ? toLoc.code : ''}`,
          qty: `${lpn.quantityBase.toLocaleString()} Units`,
          user: store.activeTenant.adminUser.name,
          note: reason
        };

        store.state.transactions[store.state.activeTenantId].unshift(newTx);
        store.save();
        this.closeModal('moveLpnModal');
        this.renderAll();
        this.showToast(`Relocated ${lpn.lpnNumber} to ${toLoc ? toLoc.code : 'new location'}`, 'success');
      });
    }

    // 3. Dispatch Inventory Form
    const dspForm = document.getElementById('dispatchStockForm');
    if (dspForm) {
      const updateDspPreview = () => {
        const itemSelect = document.getElementById('dspItemSelect');
        const qtyInput = document.getElementById('dspQuantityInput');
        const uomSelect = document.getElementById('dspUomSelect');
        const previewText = document.getElementById('dspComputationText');

        const item = store.tenantItems.find(i => i.id === itemSelect?.value);
        if (!item) return;

        const qty = parseFloat(qtyInput.value) || 0;
        const uomTierId = uomSelect?.value;
        const conv = UomEngine.convert(item, qty, uomTierId);
        const baseUom = store.getItemBaseUom(item.id);
        const itemUoms = store.getItemUoms(item.id);
        const selectedTier = itemUoms.find(u => u.id === uomTierId) || itemUoms[0];

        if (previewText) {
          previewText.textContent = `Dispatching ${qty} × ${selectedTier ? selectedTier.tierName : 'Unit'} = ${conv.baseUnits.toLocaleString()} ${baseUom?.code || 'Units'}`;
        }
      };

      document.getElementById('dspItemSelect')?.addEventListener('change', () => {
        this.populateDspUoms();
        updateDspPreview();
      });
      document.getElementById('dspQuantityInput')?.addEventListener('input', updateDspPreview);
      document.getElementById('dspUomSelect')?.addEventListener('change', updateDspPreview);

      dspForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = document.getElementById('dspItemSelect').value;
        const locationId = document.getElementById('dspLocationSelect').value;
        const destination = document.getElementById('dspDestinationInput').value.trim();
        const reference = document.getElementById('dspReferenceInput').value.trim();
        const inputQty = parseFloat(document.getElementById('dspQuantityInput').value) || 0;
        const inputUom = document.getElementById('dspUomSelect').value;

        const item = store.tenantItems.find(i => i.id === itemId);
        if (!item) return;

        const conv = UomEngine.convert(item, inputQty, inputUom);
        const loc = store.tenantLocations.find(l => l.id === locationId);
        const fac = loc ? store.tenantFacilities.find(f => f.id === loc.facilityId) : store.tenantFacilities[0];

        // Deduct from item's LPNs/stock in this location or facility
        let remainingToDeduct = conv.baseUnits;
        const itemLpns = store.tenantLpns.filter(l => l.itemId === item.id && (!locationId || l.locationId === locationId || l.facilityId === fac?.id));

        for (const lpn of itemLpns) {
          if (remainingToDeduct <= 0) break;
          if (lpn.quantityBase <= remainingToDeduct) {
            remainingToDeduct -= lpn.quantityBase;
            lpn.quantityBase = 0;
          } else {
            lpn.quantityBase = Number((lpn.quantityBase - remainingToDeduct).toFixed(2));
            remainingToDeduct = 0;
          }
        }
        store.state.licensePlates[store.state.activeTenantId] = store.tenantLpns.filter(l => l.quantityBase > 0);

        // Record Transaction in Inventory History
        const newTx = {
          id: `tx-${Date.now().toString().slice(-4)}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
          type: 'Dispatch Out',
          lpn: itemLpns[0]?.lpnNumber || 'DISPATCH',
          sku: item.sku,
          from: loc ? `${fac ? fac.code : ''} / ${loc.code}` : 'Warehouse Stock',
          to: destination || reference || 'Customer Job Site',
          qty: `-${conv.baseUnits.toLocaleString()} ${item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'} (${conv.fullCases} Cases)`,
          user: store.activeTenant.adminUser.name,
          note: `${reference} - ${destination}`
        };

        store.state.transactions[store.state.activeTenantId].unshift(newTx);
        store.save();
        this.closeModal('dispatchStockModal');
        this.renderAll();
        this.showToast(`Dispatched ${conv.baseUnits.toLocaleString()} units of ${item.sku} for ${destination}`, 'success');
      });
    }

    // 4. Adjust Inventory Form
    const adjForm = document.getElementById('adjustStockForm');
    if (adjForm) {
      document.getElementById('adjInvItemSelect')?.addEventListener('change', () => {
        this.populateAdjInvUoms();
      });

      adjForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const itemId = document.getElementById('adjInvItemSelect').value;
        const locationId = document.getElementById('adjInvLocationSelect').value;
        const adjType = document.getElementById('adjInvTypeSelect').value; // 'set', 'add', 'deduct'
        const reasonCode = document.getElementById('adjInvReasonSelect').value;
        const inputQty = parseFloat(document.getElementById('adjInvQuantityInput').value) || 0;
        const inputUom = document.getElementById('adjInvUomSelect').value;
        const notes = document.getElementById('adjInvNotesInput').value.trim();

        const item = store.tenantItems.find(i => i.id === itemId);
        if (!item) return;

        const conv = UomEngine.convert(item, inputQty, inputUom);
        const loc = store.tenantLocations.find(l => l.id === locationId);
        const fac = loc ? store.tenantFacilities.find(f => f.id === loc.facilityId) : store.tenantFacilities[0];

        const reasonLabels = {
          cycle_count: 'Cycle Count Adjustment',
          damaged: 'Scrap / Damaged Loss',
          sample: 'Showroom Sample Pull',
          found_stock: 'Found Stock Addition',
          shrinkage: 'Inventory Shrinkage'
        };

        const existingLpn = store.tenantLpns.find(l => l.itemId === item.id && (locationId ? l.locationId === locationId : true));

        let deltaQty = 0;
        if (adjType === 'set') {
          const currentOnHand = store.tenantLpns.filter(l => l.itemId === item.id).reduce((sum, l) => sum + l.quantityBase, 0);
          deltaQty = conv.baseUnits - currentOnHand;
          if (existingLpn) {
            existingLpn.quantityBase = conv.baseUnits;
          } else {
            store.state.licensePlates[store.state.activeTenantId].push({
              id: `lpn-${Date.now()}`,
              lpnNumber: `LPN-${Math.floor(100000 + Math.random() * 900000)}`,
              itemId: item.id,
              facilityId: fac?.id || 'fac-main-dc',
              locationId: locationId || 'loc-a01-r01-a',
              quantityBase: conv.baseUnits,
              status: 'available',
              receivedAt: new Date().toISOString(),
              customFields: { dye_lot_run: 'AUDIT-ADJ' }
            });
          }
        } else if (adjType === 'add') {
          deltaQty = conv.baseUnits;
          if (existingLpn) {
            existingLpn.quantityBase += conv.baseUnits;
          } else {
            store.state.licensePlates[store.state.activeTenantId].push({
              id: `lpn-${Date.now()}`,
              lpnNumber: `LPN-${Math.floor(100000 + Math.random() * 900000)}`,
              itemId: item.id,
              facilityId: fac?.id || 'fac-main-dc',
              locationId: locationId || 'loc-a01-r01-a',
              quantityBase: conv.baseUnits,
              status: 'available',
              receivedAt: new Date().toISOString(),
              customFields: { dye_lot_run: 'COUNT-FOUND' }
            });
          }
        } else if (adjType === 'deduct') {
          deltaQty = -conv.baseUnits;
          if (existingLpn) {
            existingLpn.quantityBase = Math.max(0, existingLpn.quantityBase - conv.baseUnits);
          }
        }

        store.state.licensePlates[store.state.activeTenantId] = store.tenantLpns.filter(l => l.quantityBase > 0);

        // Record Transaction
        const newTx = {
          id: `tx-${Date.now().toString().slice(-4)}`,
          timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
          type: reasonLabels[reasonCode] || 'Stock Adjustment',
          lpn: existingLpn?.lpnNumber || 'ADJUST',
          sku: item.sku,
          from: loc ? `${fac ? fac.code : ''} / ${loc.code}` : 'Warehouse Bin',
          to: 'Audit Ledger',
          qty: `${deltaQty > 0 ? '+' : ''}${deltaQty.toLocaleString()} ${item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'}`,
          user: store.activeTenant.adminUser.name,
          note: notes || 'Physical Inventory Adjustment'
        };

        store.state.transactions[store.state.activeTenantId].unshift(newTx);
        store.save();
        this.closeModal('adjustStockModal');
        this.renderAll();
        this.showToast(`Inventory updated for ${item.sku} (${newTx.qty})`, 'success');
      });
    }


    // 4. Add Item Form
    const addItemForm = document.getElementById('addItemForm');
    if (addItemForm) {
      addItemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const sku = document.getElementById('newItemSku').value.trim();
        const name = document.getElementById('newItemName').value.trim();
        const category = document.getElementById('newItemCategory').value;
        const manufacturerId = document.getElementById('newItemManufacturer').value;
        const baseUomId = document.getElementById('newItemBaseUom').value;
        const caseMultiplier = parseFloat(document.getElementById('newItemCaseQty').value) || 1;
        const palletMultiplier = parseFloat(document.getElementById('newItemPalletQty').value) || 1;
        const costPrice = parseFloat(document.getElementById('newItemCost').value) || 0;
        const sellingPrice = parseFloat(document.getElementById('newItemPrice').value) || 0;
        const reorderPoint = parseInt(document.getElementById('newItemReorder').value, 10) || 0;

        const customFields = {};
        store.tenantCustomFields.forEach(udf => {
          const inputEl = document.getElementById(`item_udf_${udf.key}`);
          if (inputEl) customFields[udf.key] = inputEl.value;
        });

        const newItem = {
          id: `item-${Date.now()}`,
          sku,
          name,
          category,
          manufacturerId,
          baseUomId,
          packaging: { caseMultiplier, palletMultiplier },
          costPrice,
          sellingPrice,
          reorderPoint,
          barcode: sku,
          customFields
        };

        if (!store.state.items[store.state.activeTenantId]) {
          store.state.items[store.state.activeTenantId] = [];
        }
        store.state.items[store.state.activeTenantId].push(newItem);
        store.save();

        // Automatically create item_uoms relational packaging tiers
        const baseUomDef = store.tenantUoms.find(u => u.id === baseUomId);
        const boxUomDef = store.tenantUoms.find(u => u.code === 'BOX' || u.code === 'CS') || store.tenantUoms[1];
        const pltUomDef = store.tenantUoms.find(u => u.code === 'PLT') || store.tenantUoms[2];

        // 1. Base tier
        store.addItemUom(newItem.id, {
          uomId: baseUomId,
          multiplier: 1,
          barcode: `${sku}-BASE`,
          description: `1 ${baseUomDef?.code || 'Base Unit'}`
        });

        // 2. Case tier if > 1
        if (caseMultiplier > 1 && boxUomDef) {
          store.addItemUom(newItem.id, {
            uomId: boxUomDef.id,
            multiplier: caseMultiplier,
            barcode: `${sku}-BOX`,
            description: `${caseMultiplier} ${baseUomDef?.code || 'units'} per box`
          });
        }

        // 3. Pallet tier if > 1
        if (palletMultiplier > 1 && pltUomDef) {
          store.addItemUom(newItem.id, {
            uomId: pltUomDef.id,
            multiplier: caseMultiplier * palletMultiplier,
            barcode: `${sku}-PLT`,
            description: `${palletMultiplier} boxes / pallet (${(caseMultiplier * palletMultiplier).toLocaleString()} ${baseUomDef?.code || 'units'})`
          });
        }

        this.closeModal('addItemModal');
        this.renderAll();
        this.showToast(`Added new item: ${sku} (${name}) with UOM tiers in item_uoms`, 'success');
      });
    }

    // 5. Add Facility Form
    const addFacForm = document.getElementById('addFacilityForm');
    if (addFacForm) {
      addFacForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('newFacilityName').value.trim();
        const code = document.getElementById('newFacilityCode').value.trim().toUpperCase();
        const type = document.getElementById('newFacilityType').value;
        const address = document.getElementById('newFacilityAddress')?.value.trim() || 'Operational Hub';
        const trackingMode = document.getElementById('newFacilityTrackingMode').value;

        const newFac = {
          id: `fac-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`,
          code,
          name,
          type,
          address,
          trackingMode: trackingMode === 'summary' ? 'summary_only' : trackingMode
        };

        if (!store.state.facilities[store.state.activeTenantId]) {
          store.state.facilities[store.state.activeTenantId] = [];
        }
        store.state.facilities[store.state.activeTenantId].push(newFac);
        store.save();
        this.closeModal('addFacilityModal');
        this.renderAll();
        this.showToast(`Created Facility: ${code} - ${name}`, 'success');
      });
    }

    // 6. Add Location Bin Form
    const addLocForm = document.getElementById('addLocationForm');
    if (addLocForm) {
      addLocForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const facilityId = document.getElementById('newLocFacilitySelect').value;
        const code = document.getElementById('newLocCode').value.trim().toUpperCase();
        const name = document.getElementById('newLocName').value.trim();
        const zone = document.getElementById('newLocZone').value;
        const capacity = parseInt(document.getElementById('newLocCapacity').value, 10) || 2;

        const newLoc = {
          id: `loc-${Date.now()}`,
          facilityId,
          code,
          name: name || code,
          zone,
          capacity,
          barcode: `LOC-${code}`
        };

        if (!store.state.locations[store.state.activeTenantId]) {
          store.state.locations[store.state.activeTenantId] = [];
        }
        store.state.locations[store.state.activeTenantId].push(newLoc);
        store.save();
        this.closeModal('addLocationModal');
        this.renderAll();
        this.showToast(`Added warehouse location: ${code}`, 'success');
      });
    }

    // 7. Add Manufacturer Form
    const addMfrForm = document.getElementById('addManufacturerForm');
    if (addMfrForm) {
      addMfrForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('newMfrName').value.trim();
        const repName = document.getElementById('newMfrRep').value.trim();
        const repPhone = document.getElementById('newMfrPhone').value.trim();
        const repEmail = document.getElementById('newMfrEmail').value.trim();
        const leadTimeDays = parseInt(document.getElementById('newMfrLeadTime').value, 10) || 5;

        const newMfr = {
          id: `mfr-${Date.now()}`,
          name,
          repName,
          repPhone,
          repEmail,
          leadTimeDays,
          brandLines: [name]
        };

        if (!store.state.manufacturers[store.state.activeTenantId]) {
          store.state.manufacturers[store.state.activeTenantId] = [];
        }
        store.state.manufacturers[store.state.activeTenantId].push(newMfr);
        store.save();
        this.closeModal('addManufacturerModal');
        this.renderAll();
        this.showToast(`Added manufacturer: ${name}`, 'success');
      });
    }

    // Tenant Custom Fields Builder
    document.getElementById('btnAddNewCustomField')?.addEventListener('click', () => {
      const fieldLabel = prompt('Enter New Custom Field Label (e.g., "Wear Layer mil", "Tile Shade", "Fabric Finish"):');
      if (fieldLabel && fieldLabel.trim()) {
        const key = fieldLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const newUdf = {
          id: `udf-${Date.now()}`,
          key,
          label: fieldLabel.trim(),
          type: 'text',
          required: false,
          showInGrid: true,
          entity: 'item'
        };
        store.state.customFields[store.state.activeTenantId].push(newUdf);
        store.save();
        this.renderTenantSettings();
        this.renderInventory();
        this.showToast(`Added custom field '${fieldLabel}'`, 'success');
      }
    });

    // 8. Add UOM Form (Modal)
    const addUomForm = document.getElementById('addUomForm');
    if (addUomForm) {
      addUomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('newUomCode').value.trim().toUpperCase();
        const name = document.getElementById('newUomName').value.trim();
        const category = document.getElementById('newUomCategory').value;
        const isBase = document.getElementById('newUomIsBase').checked;

        if (isBase) {
          store.tenantUoms.forEach(u => {
            if (u.category === category) u.isBaseDefault = false;
          });
        }

        const newUom = {
          id: `uom-${code.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString().slice(-4)}`,
          name,
          code,
          category,
          isBaseDefault: isBase
        };

        if (!store.state.unitsOfMeasure[store.state.activeTenantId]) {
          store.state.unitsOfMeasure[store.state.activeTenantId] = [];
        }
        store.state.unitsOfMeasure[store.state.activeTenantId].push(newUom);
        store.save();
        this.closeModal('addUomModal');
        this.renderAll();
        this.showToast(`Added Unit of Measure '${name}' (${code})`, 'success');
      });
    }

    // 9. Invite / Create Team Member Form (Dual-Mode: Email vs Username)
    const inviteUserForm = document.getElementById('inviteUserForm');
    if (inviteUserForm) {
      inviteUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const isMaster = this.isMasterAdmin();
        const selectedTenantId = isMaster && document.getElementById('inviteUserOrgSelect')?.value 
          ? document.getElementById('inviteUserOrgSelect').value 
          : store.state.activeTenantId;

        const name = document.getElementById('inviteUserName').value.trim();
        const isEmailMode = document.getElementById('btnModeEmailInvite')?.classList.contains('active');
        const email = isEmailMode ? document.getElementById('inviteUserEmail').value.trim() : null;
        const username = isEmailMode 
          ? (email ? email.split('@')[0].replace(/[^a-z0-9_]/gi, '_').toLowerCase() : `usr_${Date.now().toString().slice(-4)}`)
          : document.getElementById('inviteUserUsername').value.trim().toLowerCase();
        const password = isEmailMode ? null : (document.getElementById('inviteUserPassword').value.trim() || null);
        const role = document.getElementById('inviteUserRole').value;
        const facilities = document.getElementById('inviteUserFacility').value;

        const newUser = {
          id: `usr-${Date.now()}`,
          username,
          email,
          password,
          name,
          role,
          facilities,
          status: 'Active',
          tenantId: selectedTenantId
        };

        if (!store.state.users[selectedTenantId]) {
          store.state.users[selectedTenantId] = [];
        }
        store.state.users[selectedTenantId].push(newUser);
        store.save();

        if (window.supabaseService && window.supabaseService.isConnected) {
          await window.supabaseService.addUserProfile(newUser);
        }

        inviteUserForm.reset();
        this.closeModal('inviteUserModal');
        this.renderUsers();
        this.showToast(`Team member '${name}' (@${username}) added as ${role}`, 'success');
      });
    }

    // 10. Add Facility Type Form (Modal)
    const addFTypeForm = document.getElementById('addFacilityTypeForm');
    if (addFTypeForm) {
      addFTypeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const code = document.getElementById('newFacilityTypeCode').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const name = document.getElementById('newFacilityTypeName').value.trim();
        const description = document.getElementById('newFacilityTypeDesc').value.trim();

        const newFType = {
          id: `ftype-${code}-${Date.now().toString().slice(-4)}`,
          code,
          name,
          description: description || 'Operational Facility Category',
          isDefault: false
        };

        if (!store.state.facilityTypes[store.state.activeTenantId]) {
          store.state.facilityTypes[store.state.activeTenantId] = [];
        }
        store.state.facilityTypes[store.state.activeTenantId].push(newFType);
        store.save();
        addFTypeForm.reset();
        this.closeModal('addFacilityTypeModal');
        this.renderTenantSettings();
        this.populateModalSelects();
        this.showToast(`Added Facility Type '${name}' (${code})`, 'success');
      });
    }

    // 11. Add Label Template & Size Form (Modal)
    const addLblForm = document.getElementById('addLabelTemplateForm');
    if (addLblForm) {
      addLblForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('newLabelName').value.trim();
        const type = document.getElementById('newLabelType').value;
        const unit = document.getElementById('newLabelUnit').value;
        const widthIn = parseFloat(document.getElementById('newLabelWidth').value) || 4.0;
        const heightIn = parseFloat(document.getElementById('newLabelHeight').value) || 6.0;
        const includeBarcode = document.getElementById('newLabelIncludeBarcode').checked;
        const includeQr = document.getElementById('newLabelIncludeQr').checked;
        const includeLot = document.getElementById('newLabelIncludeLot').checked;

        const newTemplate = {
          id: `lbl-${Date.now()}`,
          name,
          type,
          widthIn,
          heightIn,
          unit,
          isDefault: false,
          includeBarcode,
          includeQr,
          includeLot
        };

        if (!store.state.labelTemplates[store.state.activeTenantId]) {
          store.state.labelTemplates[store.state.activeTenantId] = [];
        }
        store.state.labelTemplates[store.state.activeTenantId].push(newTemplate);
        store.save();
        addLblForm.reset();
        this.closeModal('addLabelTemplateModal');
        this.renderTenantSettings();
        this.showToast(`Added label template '${name}' (${widthIn}x${heightIn} ${unit})`, 'success');
      });
    }

    // 12. Enterprise Sign In Form (Dual-Mode: Username or Email)
    const signInForm = document.getElementById('signInForm');
    if (signInForm) {
      signInForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const identifier = document.getElementById('authIdentifier').value.trim();
        const password = document.getElementById('authPassword').value.trim();
        await this.login(identifier, password);
      });
    }

    // 13. Change / Reset Password Form
    const changePassForm = document.getElementById('changePasswordForm');
    if (changePassForm) {
      changePassForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const targetUserId = document.getElementById('changePasswordUserId').value;
        const currentPass = document.getElementById('currentPasswordInput').value.trim();
        const newPass = document.getElementById('newPasswordInput').value.trim();
        const confirmPass = document.getElementById('confirmPasswordInput').value.trim();

        if (newPass !== confirmPass) {
          this.showToast('New passwords do not match. Please verify.', 'error');
          return;
        }

        const isSelf = !targetUserId || (store.currentUser && store.currentUser.id === targetUserId);
        const activeUser = store.currentUser;

        // If self and not first-time mandatory, verify current password
        if (isSelf && !this.isMandatoryPasswordSetup) {
          const userPass = activeUser?.password;
          if (userPass && currentPass !== userPass) {
            this.showToast('Incorrect current password.', 'error');
            return;
          }
        }

        // Target user
        let userToUpdate = null;
        if (isSelf && activeUser) {
          userToUpdate = activeUser;
        } else if (targetUserId) {
          userToUpdate = store.tenantUsers.find(u => u.id === targetUserId);
        }

        if (userToUpdate) {
          userToUpdate.password = newPass;
        }

        if (store.state.currentAuthUser) {
          store.state.currentAuthUser.password = newPass;
        }

        // Update in active tenant adminUser if admin
        if (isSelf && store.activeTenant && store.activeTenant.adminUser) {
          store.activeTenant.adminUser.password = newPass;
        }

        store.save();

        // Update Supabase PostgreSQL
        if (window.supabaseService && window.supabaseService.isConnected) {
          const lookupKey = userToUpdate?.username || userToUpdate?.email || userToUpdate?.id;
          await window.supabaseService.updateUserPassword(lookupKey, newPass);
        }

        const wasMandatory = this.isMandatoryPasswordSetup;
        this.isMandatoryPasswordSetup = false;

        const closeBtn = document.getElementById('changePasswordModalCloseBtn');
        const cancelBtn = document.getElementById('btnCancelChangePassword');
        if (closeBtn) closeBtn.style.display = 'block';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';

        changePassForm.reset();
        this.closeModal('changePasswordModal');

        if (wasMandatory) {
          this.showToast('🎉 Password set successfully! Welcome to your workspace.', 'success');
        } else {
          this.showToast('Password successfully updated and synced!', 'success');
        }
      });
    }

    document.getElementById('btnSaveTenantConfig')?.addEventListener('click', () => {
      this.showToast('Tenant configuration saved & synced!', 'success');
    });

    // Barcode Scanner Manual Entry
    document.getElementById('btnSubmitManualScan')?.addEventListener('click', () => {
      const barcode = document.getElementById('manualScanInput').value.trim();
      if (barcode) this.processBarcodeScan(barcode);
    });

    // Provision New Client Tenant Form & Auto-slugifier
    const provNameInp = document.getElementById('provisionTenantName');
    const provIdInp = document.getElementById('provisionTenantId');
    const provSlugInp = document.getElementById('provisionTenantSlug');
    if (provNameInp && provIdInp && provSlugInp) {
      provNameInp.addEventListener('input', (e) => {
        const raw = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        if (!provIdInp.dataset.manual) {
          provIdInp.value = raw ? `tenant-${raw}` : '';
        }
        if (!provSlugInp.dataset.manual) {
          provSlugInp.value = raw || '';
        }
      });
      provIdInp.addEventListener('input', () => { provIdInp.dataset.manual = 'true'; });
      provSlugInp.addEventListener('input', () => { provSlugInp.dataset.manual = 'true'; });
    }

    const provForm = document.getElementById('provisionTenantForm');
    if (provForm) {
      provForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.handleProvisionTenantSubmit();
      });
    }
  }

  // ============================================================================
  // ROUTING & NAVIGATION
  // ============================================================================
  navigateTo(viewId) {
    this.views.forEach(view => {
      view.classList.remove('active');
      if (view.id === `view-${viewId}`) {
        view.classList.add('active');
      }
    });

    this.navItems.forEach(item => {
      if (item.getAttribute('data-view') === viewId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.initIcons();
  }

  // ============================================================================
  // MASTER RENDER DISPATCHER
  // ============================================================================
  renderAll() {
    this.renderHeader();
    this.renderDashboard();
    this.renderInventory();
    this.renderItemDetail(this.activeDetailItemId);
    this.renderItemsMaster();
    this.renderFacilities();
    this.renderManufacturers();
    this.renderOperations();
    this.renderTenantSettings();
    this.renderUsers();
    this.renderMasterTenants();
    this.populateModalSelects();
    this.initIcons();
  }

  // ============================================================================
  // HEADER RENDERING
  // ============================================================================
  renderHeader() {
    const isMaster = this.isMasterAdmin();

    // Tenant Switcher dropdown
    let tenantOptions = store.state.tenants.map(t => `
      <option value="${t.id}" ${t.id === store.state.activeTenantId ? 'selected' : ''}>${t.name}</option>
    `).join('');

    if (isMaster) {
      tenantOptions += `<option value="__NEW_TENANT__">+ Provision New Client...</option>`;
    }
    this.tenantSelect.innerHTML = tenantOptions;

    this.globalFacilitySelect.innerHTML = `
      <option value="all">All Facilities</option>
      ${store.tenantFacilities.map(f => `
        <option value="${f.id}" ${f.id === store.state.activeFacilityId ? 'selected' : ''}>${f.code} - ${f.name} (${f.trackingMode === 'lpn' ? 'LPN' : 'Summary'})</option>
      `).join('')}
    `;

    document.getElementById('currentTenantSub').textContent = store.activeTenant.name;
    document.getElementById('sidebarTenantName').textContent = store.activeTenant.name;
    document.getElementById('totalLpnBadge').textContent = store.tenantLpns.length;

    // Toggle Platform Admin section in sidebar and user menu
    const sidebarMaster = document.getElementById('sidebarMasterSection');
    if (sidebarMaster) {
      sidebarMaster.style.display = isMaster ? 'block' : 'none';
    }

    const btnPlatformAdmin = document.getElementById('btnUserMenuPlatformAdmin');
    if (btnPlatformAdmin) {
      btnPlatformAdmin.style.display = isMaster ? 'flex' : 'none';
    }

    const activeUser = store.currentUser || store.activeTenant.adminUser;
    if (activeUser) {
      const userNameEl = document.getElementById('userName');
      if (userNameEl) userNameEl.textContent = activeUser.name || 'Admin';

      const userRoleBadge = document.getElementById('userRoleBadge');
      if (userRoleBadge) {
        if (isMaster) {
          userRoleBadge.className = 'badge badge-master-admin';
          userRoleBadge.innerHTML = '<i data-lucide="crown"></i> Master Admin';
        } else {
          userRoleBadge.className = 'user-role';
          userRoleBadge.textContent = activeUser.role || 'Company Admin';
        }
      }

      const dropFullName = document.getElementById('dropdownUserFullName');
      if (dropFullName) dropFullName.textContent = activeUser.name || 'Admin';

      const dropRole = document.getElementById('dropdownUserRole');
      if (dropRole) dropRole.textContent = isMaster ? 'Master Admin (Platform Owner)' : (activeUser.role || 'Company Admin');

      const avatarEl = document.getElementById('userAvatar');
      if (avatarEl && activeUser.name) {
        const initials = activeUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
        avatarEl.textContent = initials || 'US';
      }
    }

    this.updateInventoryModeUI();
  }

  updateInventoryModeUI() {
    const lpnSupported = this.isCurrentFacilityLpnEnabled();

    if (!lpnSupported) {
      store.state.inventoryMode = 'summary';
    }

    const isLpn = store.state.inventoryMode === 'lpn' && lpnSupported;

    // Header Mode Toggle
    if (this.headerModePillToggle) {
      if (!lpnSupported) {
        this.headerModePillToggle.style.display = 'none';
        this.headerLockedSummaryBadge?.classList.remove('hidden');
      } else {
        this.headerModePillToggle.style.display = 'flex';
        this.headerLockedSummaryBadge?.classList.add('hidden');
        this.headerModeLpnBtn?.classList.toggle('active', isLpn);
        this.headerModeSummaryBtn?.classList.toggle('active', !isLpn);
      }
    }

    // Dashboard Mode Toggle
    if (this.dashModeToggleWrapper) {
      if (!lpnSupported) {
        this.dashModeToggleWrapper.style.display = 'none';
        this.dashLockedSummaryBadge?.classList.remove('hidden');
      } else {
        this.dashModeToggleWrapper.style.display = 'inline-flex';
        this.dashLockedSummaryBadge?.classList.add('hidden');
        this.dashModeLpnBtn?.classList.toggle('active', isLpn);
        this.dashModeSummaryBtn?.classList.toggle('active', !isLpn);
      }
    }

    // Inventory View Segmented Buttons
    if (this.viewToggleLpn) {
      if (!lpnSupported) {
        this.viewToggleLpn.style.display = 'none';
        this.viewToggleSummary?.classList.add('active');
      } else {
        this.viewToggleLpn.style.display = 'inline-flex';
        this.viewToggleLpn.classList.toggle('active', isLpn);
        this.viewToggleSummary?.classList.toggle('active', !isLpn);
      }
    }

    this.lpnModeContainer?.classList.toggle('active', isLpn);
    this.summaryModeContainer?.classList.toggle('active', !isLpn);

    if (this.inventoryModeBadge) {
      if (!lpnSupported) {
        this.inventoryModeBadge.textContent = 'Facility Locked: Summary Mode';
        this.inventoryModeBadge.className = 'badge badge-warning';
      } else {
        this.inventoryModeBadge.textContent = isLpn ? 'LPN Pallet Tracking Active' : 'Summary Stock Mode Active';
        this.inventoryModeBadge.className = isLpn ? 'badge badge-primary' : 'badge badge-accent';
      }
    }
  }

  // ============================================================================
  // DASHBOARD RENDERING (LPN TELEMETRY vs SUMMARY TELEMETRY)
  // ============================================================================
  renderDashboard() {
    const lpnSupported = this.isCurrentFacilityLpnEnabled();
    const isLpn = store.state.inventoryMode === 'lpn' && lpnSupported;
    const lpns = store.tenantLpns;
    const items = store.tenantItems;
    const facilities = store.tenantFacilities;
    const locations = store.tenantLocations;

    const kpiGrid = document.querySelector('.kpi-grid');
    const splitGrid = document.querySelector('.dashboard-grid-split');

    if (isLpn) {
      // --- LPN TELEMETRY DASHBOARD ---
      document.getElementById('dashboardSubtitle').textContent = 'Real-time LPN pallet telemetry, bin capacity, and warehouse movements';

      const totalUnits = lpns.reduce((sum, l) => sum + (Number(l.quantityBase) || 0), 0);
      const primaryUom = store.tenantUoms.find(u => u.isBaseDefault);

      let lowStockCount = 0;
      items.forEach(item => {
        const itemUnits = lpns.filter(l => l.itemId === item.id).reduce((sum, l) => sum + l.quantityBase, 0);
        if (itemUnits <= (item.reorderPoint || 0)) lowStockCount++;
      });

      kpiGrid.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Active License Plates (LPNs)</span>
            <div class="kpi-icon-wrapper blue"><i data-lucide="qr-code"></i></div>
          </div>
          <div class="kpi-value font-mono">${lpns.length}</div>
          <div class="kpi-meta positive">
            <i data-lucide="trending-up"></i>
            <span>Stored across <strong>${locations.length}</strong> warehouse bins</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Total Inventory Units</span>
            <div class="kpi-icon-wrapper purple"><i data-lucide="package-search"></i></div>
          </div>
          <div class="kpi-value font-mono">${totalUnits.toLocaleString()} <small>${primaryUom ? primaryUom.name : 'Units'}</small></div>
          <div class="kpi-meta neutral">
            <i data-lucide="boxes"></i>
            <span>Equivalent to ${Math.floor(totalUnits / 1800)} Pallets / ${Math.floor(totalUnits / 30)} Cases</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Low Stock SKUs</span>
            <div class="kpi-icon-wrapper amber"><i data-lucide="alert-triangle"></i></div>
          </div>
          <div class="kpi-value font-mono">${lowStockCount}</div>
          <div class="kpi-meta warning">
            <i data-lucide="clock"></i>
            <span>Below configured reorder thresholds</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">LPN Facilities</span>
            <div class="kpi-icon-wrapper green"><i data-lucide="building"></i></div>
          </div>
          <div class="kpi-value font-mono">${facilities.filter(f => f.trackingMode === 'lpn').length} / ${facilities.length}</div>
          <div class="kpi-meta positive">
            <i data-lucide="check-circle-2"></i>
            <span>Pallet Bin Tracking Enabled</span>
          </div>
        </div>
      `;

      const recentTx = store.tenantTransactions.slice(0, 5);
      const txRows = recentTx.length === 0 ?
        `<tr><td colspan="6" class="text-muted" style="text-align:center; padding:1.5rem;">No recent warehouse movements recorded.</td></tr>` :
        recentTx.map(tx => `
          <tr>
            <td><span class="text-muted" style="font-size:0.75rem;">${tx.timestamp}</span></td>
            <td><span class="badge ${tx.type.includes('Receive') ? 'badge-success' : (tx.type.includes('Dispatch') || tx.type.includes('Scrap') ? 'badge-warning' : 'badge-primary')}">${tx.type}</span></td>
            <td><strong class="font-mono text-primary">${tx.lpn}</strong> <small class="text-muted">(${tx.sku})</small></td>
            <td><span style="font-size:0.78rem;">${tx.from} &rarr; <strong>${tx.to}</strong></span></td>
            <td><span class="font-mono" style="${tx.qty.startsWith('-') ? 'color:var(--accent-rose); font-weight:700;' : ''}">${tx.qty}</span></td>
            <td><span class="text-muted">${tx.user}</span></td>
          </tr>
        `).join('');

      const facListHtml = facilities.map(f => {
        const facLpns = lpns.filter(l => l.facilityId === f.id);
        const facLocs = locations.filter(loc => loc.facilityId === f.id);
        const percent = Math.min(100, Math.round((facLpns.length / (facLocs.length * 2 || 1)) * 100));
        const isLpnFac = f.trackingMode === 'lpn';

        return `
          <div class="facility-status-item">
            <div class="facility-item-header">
              <span class="facility-item-name"><i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;color:var(--accent-cyan);"></i> ${f.code} - ${f.name}</span>
              <span class="badge ${isLpnFac ? 'badge-primary' : 'badge-warning'}">${isLpnFac ? 'LPN MODE' : 'SUMMARY ONLY'}</span>
            </div>
            ${isLpnFac ? `
              <div class="facility-progress-bar">
                <div class="progress-fill" style="width: ${percent}%;"></div>
              </div>
              <div class="facility-item-meta">
                <span><strong>${facLpns.length}</strong> LPNs Stored</span>
                <span><strong>${facLocs.length}</strong> Bins (${percent}% Cap)</span>
              </div>
            ` : `
              <div class="facility-item-meta" style="margin-top:0.3rem;">
                <span class="text-muted"><i data-lucide="lock" style="width:12px;height:12px;display:inline-block;vertical-align:middle;"></i> Locked to Summary Tracking</span>
              </div>
            `}
          </div>
        `;
      }).join('');

      splitGrid.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-header-left">
              <i data-lucide="history" class="text-primary"></i>
              <h3 class="card-title">Recent Stock Movements & Audit Trail</h3>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="app.navigateTo('operations')">View All</button>
          </div>
          <div class="card-body no-padding">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr><th>Time</th><th>Type</th><th>Item / LPN</th><th>Movement</th><th>Quantity</th><th>User</th></tr>
                </thead>
                <tbody>${txRows}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-header-left">
              <i data-lucide="pie-chart" class="text-accent"></i>
              <h3 class="card-title">Facility Pallet Capacities</h3>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="app.openModal('addFacilityModal')">+ New</button>
          </div>
          <div class="card-body">
            <div class="facility-status-list">${facListHtml}</div>
          </div>
        </div>
      `;

    } else {
      // --- SUMMARY TELEMETRY DASHBOARD ---
      document.getElementById('dashboardSubtitle').textContent = 'Aggregated SKU inventory counts, health alerts, and valuation breakdown';

      const totalUnits = lpns.reduce((sum, l) => sum + (Number(l.quantityBase) || 0), 0);
      const totalValuation = items.reduce((sum, item) => {
        const itemUnits = lpns.filter(l => l.itemId === item.id).reduce((s, l) => s + l.quantityBase, 0);
        return sum + (itemUnits * (item.costPrice || 0));
      }, 0);

      let lowStockCount = 0;
      items.forEach(item => {
        const itemUnits = lpns.filter(l => l.itemId === item.id).reduce((sum, l) => sum + l.quantityBase, 0);
        if (itemUnits <= (item.reorderPoint || 0)) lowStockCount++;
      });

      kpiGrid.innerHTML = `
        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Active Catalog SKUs</span>
            <div class="kpi-icon-wrapper blue"><i data-lucide="tag"></i></div>
          </div>
          <div class="kpi-value font-mono">${items.length}</div>
          <div class="kpi-meta positive">
            <i data-lucide="check-circle-2"></i>
            <span>Active products in inventory</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Total On-Hand Quantity</span>
            <div class="kpi-icon-wrapper purple"><i data-lucide="boxes"></i></div>
          </div>
          <div class="kpi-value font-mono">${totalUnits.toLocaleString()}</div>
          <div class="kpi-meta neutral">
            <i data-lucide="layers"></i>
            <span>Aggregated across all facilities</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Reorder Alerts</span>
            <div class="kpi-icon-wrapper amber"><i data-lucide="alert-triangle"></i></div>
          </div>
          <div class="kpi-value font-mono">${lowStockCount}</div>
          <div class="kpi-meta warning">
            <i data-lucide="clock"></i>
            <span>SKUs below minimum stock</span>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <span class="kpi-title">Inventory Valuation</span>
            <div class="kpi-icon-wrapper green"><i data-lucide="dollar-sign"></i></div>
          </div>
          <div class="kpi-value font-mono">$${totalValuation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          <div class="kpi-meta positive">
            <i data-lucide="trending-up"></i>
            <span>Total cost value on hand</span>
          </div>
        </div>
      `;

      const summaryRowsHtml = items.map(item => {
        const itemUnits = lpns.filter(l => l.itemId === item.id).reduce((sum, l) => sum + l.quantityBase, 0);
        const isLow = itemUnits <= (item.reorderPoint || 0);
        const uomName = item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea';

        return `
          <tr>
            <td><strong class="font-mono text-primary">${item.sku}</strong></td>
            <td><strong>${item.name}</strong></td>
            <td><span class="badge badge-subtle">${item.category}</span></td>
            <td><strong class="font-mono">${itemUnits.toLocaleString()}</strong> <small class="text-muted">${uomName}</small></td>
            <td><span class="font-mono">${item.reorderPoint || 0}</span></td>
            <td><span class="badge ${isLow ? 'badge-warning' : 'badge-success'}">${isLow ? 'REORDER LOW' : 'OPTIMAL'}</span></td>
            <td>
              <div style="display:flex; gap:0.35rem;">
                <button class="btn btn-xs btn-secondary" onclick="app.triggerReceiveForItem('${item.id}')" title="Add Stock">
                  <i data-lucide="plus"></i> Add
                </button>
                <button class="btn btn-xs btn-outline" onclick="app.triggerAdjustModal(null, '${item.id}')" title="Adjust / Pick Stock Out">
                  <i data-lucide="package-minus"></i> Pick
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      const facSummaryHtml = facilities.map(f => {
        const facUnits = lpns.filter(l => l.facilityId === f.id).reduce((sum, l) => sum + l.quantityBase, 0);
        const isLpnFac = f.trackingMode === 'lpn';

        return `
          <div class="facility-status-item">
            <div class="facility-item-header">
              <span class="facility-item-name"><i data-lucide="building-2" style="width:14px;height:14px;display:inline-block;vertical-align:middle;color:var(--accent-cyan);"></i> ${f.code} - ${f.name}</span>
              <span class="badge ${isLpnFac ? 'badge-primary' : 'badge-warning'}">${isLpnFac ? 'LPN MODE' : 'SUMMARY ONLY'}</span>
            </div>
            <div class="facility-item-meta" style="margin-top:0.3rem;">
              <span><strong>${facUnits.toLocaleString()}</strong> Total Units Stored</span>
              <span class="text-muted">${f.type.toUpperCase()}</span>
            </div>
          </div>
        `;
      }).join('');

      splitGrid.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div class="card-header-left">
              <i data-lucide="table" class="text-primary"></i>
              <h3 class="card-title">Summary Inventory Stock & Reorder Status</h3>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="app.navigateTo('inventory')">View Full Catalog</button>
          </div>
          <div class="card-body no-padding">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr><th>SKU</th><th>Product</th><th>Category</th><th>In Stock</th><th>Reorder Pt</th><th>Health</th><th>Action</th></tr>
                </thead>
                <tbody>${summaryRowsHtml}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-header-left">
              <i data-lucide="building" class="text-accent"></i>
              <h3 class="card-title">Facilities Volume Summary</h3>
            </div>
          </div>
          <div class="card-body">
            <div class="facility-status-list">${facSummaryHtml}</div>
          </div>
        </div>
      `;
    }

    this.initIcons();
  }

  // ============================================================================
  // INVENTORY STOCK EXPLORER (DUAL MODE: LPN vs SUMMARY)
  // ============================================================================
  renderInventory() {
    const searchTerm = (this.inventorySearchInput?.value || '').toLowerCase();
    const facilityFilter = this.filterFacilitySelect?.value || 'all';
    const categoryFilter = this.filterCategorySelect?.value || 'all';
    const statusFilter = this.filterStatusSelect?.value || 'all';

    const categories = Array.from(new Set(store.tenantItems.map(i => i.category)));
    if (this.filterCategorySelect) {
      this.filterCategorySelect.innerHTML = `<option value="all">All Categories</option>` +
        categories.map(c => `<option value="${c}">${c}</option>`).join('');
      if (categoryFilter !== 'all') this.filterCategorySelect.value = categoryFilter;
    }

    if (this.filterFacilitySelect) {
      this.filterFacilitySelect.innerHTML = `<option value="all">All Facilities</option>` +
        store.tenantFacilities.map(f => `<option value="${f.id}">${f.code} - ${f.name}</option>`).join('');
      if (facilityFilter !== 'all') this.filterFacilitySelect.value = facilityFilter;
    }

    const tableBody = document.getElementById('inventoryMasterStockTableBody');
    if (!tableBody) return;

    const items = store.tenantItems;

    // Filter items
    const filteredItems = items.filter(item => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;

      // Check on-hand for this item
      const itemLpns = store.tenantLpns.filter(l => l.itemId === item.id && (facilityFilter === 'all' || l.facilityId === facilityFilter));
      const totalOnHand = itemLpns.reduce((sum, l) => sum + (l.quantityBase || 0), 0);

      if (statusFilter === 'in_stock' && totalOnHand <= 0) return false;
      if (statusFilter === 'low_stock' && (totalOnHand <= 0 || totalOnHand > (item.reorderPoint || 0))) return false;
      if (statusFilter === 'out_of_stock' && totalOnHand > 0) return false;

      if (searchTerm) {
        const matchesSearch =
          item.sku.toLowerCase().includes(searchTerm) ||
          item.name.toLowerCase().includes(searchTerm) ||
          item.category.toLowerCase().includes(searchTerm) ||
          itemLpns.some(l => {
            const loc = store.tenantLocations.find(loc => loc.id === l.locationId);
            return (
              l.lpnNumber.toLowerCase().includes(searchTerm) ||
              (loc && loc.code.toLowerCase().includes(searchTerm)) ||
              (l.customFields?.dye_lot_run && l.customFields.dye_lot_run.toLowerCase().includes(searchTerm))
            );
          });
        if (!matchesSearch) return false;
      }

      return true;
    });

    if (filteredItems.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="10" class="text-muted" style="text-align:center; padding:3rem;">
            <i data-lucide="package-search" style="width:36px;height:36px;margin:0 auto 0.5rem;display:block;opacity:0.4;"></i>
            <strong>No Inventory Records Found</strong>
            <p style="font-size:0.8rem; margin-top:0.25rem;">Try adjusting your search criteria or click 'Receive New Inventory' above.</p>
          </td>
        </tr>
      `;
      this.initIcons();
      return;
    }

    tableBody.innerHTML = filteredItems.map(item => {
      const itemLpns = store.tenantLpns.filter(l => l.itemId === item.id && (facilityFilter === 'all' || l.facilityId === facilityFilter));
      const totalOnHand = itemLpns.reduce((sum, l) => sum + (l.quantityBase || 0), 0);
      const baseUom = store.getItemBaseUom(item.id);
      const uomCode = baseUom ? baseUom.code : 'SQFT';

      // Locations breakdown
      const activeLocs = Array.from(new Set(itemLpns.map(l => {
        const loc = store.tenantLocations.find(loc => loc.id === l.locationId);
        const fac = store.tenantFacilities.find(f => f.id === l.facilityId);
        return loc ? `${fac ? fac.code : ''} ${loc.code}` : 'Bin Staging';
      })));

      const locBadgesHtml = activeLocs.length > 0
        ? activeLocs.map(loc => `<span class="badge badge-subtle" style="font-size:0.75rem; font-weight:600;"><i data-lucide="map-pin" style="width:11px;height:11px;margin-right:2px;"></i>${loc}</span>`).join(' ')
        : `<span class="text-muted" style="font-size:0.8rem;">Unassigned</span>`;

      // Packaging conversion
      const packagingBadge = UomEngine.formatPackagingBadge(item, totalOnHand);

      // Lots and LPN tags
      const activeLots = Array.from(new Set(itemLpns.map(l => l.customFields?.dye_lot_run || l.customFields?.batch_lot_tag).filter(Boolean)));
      const lotHtml = activeLots.length > 0
        ? `<div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:0.78rem; font-weight:700; color:var(--text-main);">${activeLots.join(', ')}</span>
            <span class="text-muted" style="font-size:0.7rem;">${itemLpns.length} Active Pallet / LPN tags</span>
          </div>`
        : `<span class="text-muted" style="font-size:0.8rem;">${itemLpns.length > 0 ? `${itemLpns.length} LPN tags` : '-'}</span>`;

      // Total Inventory Asset Value
      const unitCost = Number(item.costPrice || 0);
      const totalValue = totalOnHand * unitCost;

      // Status Health
      let statusBadge = `<span class="badge badge-success">In Stock</span>`;
      if (totalOnHand === 0) {
        statusBadge = `<span class="badge badge-danger">Out of Stock</span>`;
      } else if (totalOnHand <= (item.reorderPoint || 0)) {
        statusBadge = `<span class="badge badge-warning">Low Stock</span>`;
      }

      return `
        <tr>
          <td><strong class="font-mono text-primary" style="cursor:pointer;" onclick="app.navigateToItemDetail('${item.id}')">${item.sku}</strong></td>
          <td>
            <div style="display:flex; flex-direction:column;">
              <strong style="color:var(--text-main); cursor:pointer;" onclick="app.navigateToItemDetail('${item.id}')">${item.name}</strong>
              <span class="text-muted" style="font-size:0.75rem;">${item.category}</span>
            </div>
          </td>
          <td><span class="badge badge-subtle">${item.category}</span></td>
          <td><div style="display:flex; flex-wrap:wrap; gap:4px; max-width:220px;">${locBadgesHtml}</div></td>
          <td>
            <span class="font-mono" style="font-size:0.95rem; font-weight:800; color:var(--text-main);">
              ${totalOnHand.toLocaleString()} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">${uomCode}</span>
            </span>
          </td>
          <td>
            <span class="badge badge-outline" style="font-size:0.78rem; font-weight:700; color:var(--primary);">
              ${packagingBadge}
            </span>
          </td>
          <td>${lotHtml}</td>
          <td>
            <span class="font-mono" style="font-size:0.85rem; font-weight:700; color:var(--text-main);">
              $${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-xs btn-primary" onclick="app.triggerReceiveForItem('${item.id}')" title="Receive new inbound stock">
                <i data-lucide="package-plus"></i> Receive
              </button>
              <button class="btn btn-xs btn-secondary" onclick="app.triggerDispatchForItem('${item.id}')" title="Dispatch / Pick stock">
                <i data-lucide="package-minus"></i> Dispatch
              </button>
              <button class="btn btn-xs btn-outline" onclick="app.triggerAdjustForItem('${item.id}')" title="Adjust / Correct inventory count">
                <i data-lucide="sliders"></i> Adjust
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.initIcons();
  }

  // ============================================================================
  // MASTER DATA: ITEM DETAILS & ITEM-LEVEL UOM SUBPAGE (item_uoms Table)
  // ============================================================================
  openItemDetail(itemId) {
    this.activeDetailItemId = itemId;
    this.renderItemDetail(itemId);
    this.navigateTo('item-detail');
  }

  renderItemDetail(itemId) {
    const item = store.tenantItems.find(i => i.id === itemId) || store.tenantItems[0];
    if (!item) return;

    this.activeDetailItemId = item.id;
    const mfr = store.tenantManufacturers.find(m => m.id === item.manufacturerId);
    const baseUom = store.getItemBaseUom(item.id);
    const itemUoms = store.getItemUoms(item.id);

    // 1. Breadcrumbs & Header
    if (this.itemDetailBreadcrumbSku) this.itemDetailBreadcrumbSku.textContent = item.sku;
    if (this.itemDetailTitle) this.itemDetailTitle.textContent = item.name;
    if (this.itemDetailSubtitle) {
      this.itemDetailSubtitle.innerHTML = `SKU: <strong class="text-primary font-mono">${item.sku}</strong> &mdash; Relational Packaging Hierarchy &amp; Conversions (<code>item_uoms</code>)`;
    }
    if (this.itemDetailCategoryBadge) this.itemDetailCategoryBadge.textContent = item.category;

    // 2. Metadata Grid
    if (this.itemDetailMetaGrid) {
      const customFieldCards = store.tenantCustomFields
        .filter(u => u.entity === 'item')
        .map(udf => {
          const val = item.customFields?.[udf.key] ?? 'N/A';
          return `
            <div class="item-metadata-item">
              <span class="item-meta-label">${udf.label}</span>
              <span class="item-meta-value font-mono">${val}</span>
            </div>
          `;
        }).join('');

      this.itemDetailMetaGrid.innerHTML = `
        <div class="item-metadata-item">
          <span class="item-meta-label">SKU / Item Code</span>
          <span class="item-meta-value font-mono text-primary">${item.sku}</span>
        </div>
        <div class="item-metadata-item">
          <span class="item-meta-label">Manufacturer</span>
          <span class="item-meta-value">${mfr ? mfr.name : 'Unknown'}</span>
        </div>
        <div class="item-metadata-item">
          <span class="item-meta-label">Base Storage Unit</span>
          <span class="item-meta-value"><span class="badge badge-primary">${baseUom ? baseUom.name : 'Square Feet'} (${baseUom?.code || 'SQFT'})</span></span>
        </div>
        <div class="item-metadata-item">
          <span class="item-meta-label">Unit Cost Price</span>
          <span class="item-meta-value font-mono">$${(item.costPrice || 0).toFixed(2)} / ${baseUom?.code || 'unit'}</span>
        </div>
        <div class="item-metadata-item">
          <span class="item-meta-label">Wholesale Price</span>
          <span class="item-meta-value font-mono">$${(item.sellingPrice || 0).toFixed(2)} / ${baseUom?.code || 'unit'}</span>
        </div>
        <div class="item-metadata-item">
          <span class="item-meta-label">Reorder Minimum</span>
          <span class="item-meta-value font-mono">${(item.reorderPoint || 0).toLocaleString()} ${baseUom?.code || 'units'}</span>
        </div>
        ${customFieldCards}
      `;
    }

    // 3. Item UOMs Relational Table
    if (this.itemUomsRelationalTableBody) {
      this.itemUomsRelationalTableBody.innerHTML = itemUoms.map((tier, idx) => {
        const uomDef = store.tenantUoms.find(u => u.id === tier.uomId);
        const isBase = tier.isBase || tier.multiplier === 1;
        const levelBadgeClass = isBase ? 'badge-primary' : (idx === itemUoms.length - 1 ? 'badge-accent' : 'badge-subtle');
        const levelLabel = isBase ? 'Level 1: Base (Indivisible)' : `Level ${idx + 1}: ${tier.tierName}`;

        return `
          <tr>
            <td><span class="badge ${levelBadgeClass}">${levelLabel}</span></td>
            <td><strong>${tier.tierName}</strong></td>
            <td><span class="badge badge-subtle font-mono">${uomDef ? uomDef.code : 'UOM'}</span></td>
            <td>
              <strong class="font-mono text-primary text-lg">${tier.multiplier.toLocaleString()}</strong> 
              <small class="text-muted">${baseUom?.code || 'Base Units'}</small>
            </td>
            <td>
              <span class="font-mono" style="font-size:0.85rem; font-weight:600; color:var(--text-main);">
                1 ${uomDef ? uomDef.code : tier.tierName} = ${tier.multiplier.toLocaleString()} ${baseUom?.code || 'Base Units'}
              </span>
            </td>
            <td>
              <code class="font-mono text-xs">${tier.barcode || 'N/A'}</code>
            </td>
            <td>
              <span style="font-size:0.82rem; color:var(--text-muted);">${tier.description || 'Packaging unit'}</span>
            </td>
            <td>
              ${isBase ? '<span class="badge badge-subtle text-xs">Primary Base</span>' : `
                <button class="btn btn-xs btn-outline" style="color:var(--accent-red); border-color:rgba(239,68,68,0.3);" onclick="app.deleteItemUom('${tier.id}')" title="Delete Tier">
                  <i data-lucide="trash-2"></i> Delete
                </button>
              `}
            </td>
          </tr>
        `;
      }).join('');
    }

    // 4. Visual Packaging Chain Flow
    if (this.itemDetailVisualChain) {
      const highest = itemUoms[itemUoms.length - 1];
      const middle = itemUoms.length > 2 ? itemUoms[1] : null;
      const base = itemUoms[0];

      let visualHtml = '';

      if (highest && highest.multiplier > 1) {
        const highUomDef = store.tenantUoms.find(u => u.id === highest.uomId);
        visualHtml += `
          <div class="visual-chain-node">
            <div class="visual-node-left">
              <div class="visual-node-icon"><i data-lucide="package-check"></i></div>
              <div>
                <div class="visual-node-title">1 ${highest.tierName} (${highUomDef?.code || 'PLT'})</div>
                <div class="visual-node-sub">${highest.description || 'Master Bulk Handling Tier'}</div>
              </div>
            </div>
            <div class="visual-node-multiplier">= ${highest.multiplier.toLocaleString()} ${baseUom?.code || 'Units'}</div>
          </div>
        `;
      }

      if (middle && middle.multiplier > 1 && middle.id !== highest?.id) {
        const midUomDef = store.tenantUoms.find(u => u.id === middle.uomId);
        const packsInHigh = highest ? Math.round(highest.multiplier / middle.multiplier) : 1;
        visualHtml += `
          <div class="visual-chain-connector">
            <i data-lucide="arrow-down"></i> Contains ${packsInHigh} &times; ${middle.tierName}s
          </div>
          <div class="visual-chain-node">
            <div class="visual-node-left">
              <div class="visual-node-icon" style="background:rgba(139,92,246,0.15); color:var(--accent-purple);"><i data-lucide="box"></i></div>
              <div>
                <div class="visual-node-title">1 ${middle.tierName} (${midUomDef?.code || 'BOX'})</div>
                <div class="visual-node-sub">${middle.description || 'Inner Pack Tier'}</div>
              </div>
            </div>
            <div class="visual-node-multiplier">= ${middle.multiplier.toLocaleString()} ${baseUom?.code || 'Units'}</div>
          </div>
        `;
      }

      if (base) {
        const baseUomDef = store.tenantUoms.find(u => u.id === base.uomId);
        visualHtml += `
          <div class="visual-chain-connector">
            <i data-lucide="arrow-down"></i> Breakdown to Indivisible Stock
          </div>
          <div class="visual-chain-node is-base">
            <div class="visual-node-left">
              <div class="visual-node-icon" style="background:rgba(16,185,129,0.15); color:var(--accent-emerald);"><i data-lucide="grid"></i></div>
              <div>
                <div class="visual-node-title">1 ${base.tierName} (${baseUomDef?.code || 'SQFT'})</div>
                <div class="visual-node-sub">Standard Database Atomic Tracking Unit</div>
              </div>
            </div>
            <div class="visual-node-multiplier" style="color:var(--accent-emerald);">1.0 ${baseUomDef?.code || 'SQFT'}</div>
          </div>
        `;
      }

      this.itemDetailVisualChain.innerHTML = visualHtml;
    }

    // 5. Populate Simulation UOM Select
    if (this.itemSimUomSelect) {
      this.itemSimUomSelect.innerHTML = itemUoms.map(tier => {
        const uomDef = store.tenantUoms.find(u => u.id === tier.uomId);
        return `<option value="${tier.id}">1 ${tier.tierName} (${tier.multiplier} ${baseUom?.code || 'units'})</option>`;
      }).join('');

      // Default to highest tier if available
      if (itemUoms.length > 1) {
        this.itemSimUomSelect.value = itemUoms[itemUoms.length - 1].id;
      }
    }

    this.updateItemSimCalculator();
    this.initIcons();
  }

  updateItemSimCalculator() {
    const item = store.tenantItems.find(i => i.id === this.activeDetailItemId) || store.tenantItems[0];
    if (!item) return;

    const inputQty = parseFloat(this.itemSimQtyInput?.value) || 0;
    const selectedTierId = this.itemSimUomSelect?.value;
    const itemUoms = store.getItemUoms(item.id);
    const baseUom = store.getItemBaseUom(item.id);
    const baseCode = baseUom?.code || 'SQFT';

    const selectedTier = itemUoms.find(u => u.id === selectedTierId) || itemUoms[0];
    const totalBaseUnits = (inputQty * (selectedTier?.multiplier || 1));

    if (this.itemSimBaseUnits) this.itemSimBaseUnits.textContent = totalBaseUnits.toLocaleString();
    if (this.itemSimBaseUnitName) this.itemSimBaseUnitName.textContent = baseCode;

    // Highest breakdown summary
    const highest = itemUoms[itemUoms.length - 1];
    const middle = itemUoms.length > 2 ? itemUoms[1] : null;

    if (this.itemSimFullTiers) {
      if (highest && highest.multiplier > 1 && totalBaseUnits >= highest.multiplier) {
        const highCount = (totalBaseUnits / highest.multiplier).toFixed(1);
        this.itemSimFullTiers.textContent = `${highCount} ${highest.tierName}`;
      } else if (middle && middle.multiplier > 1 && totalBaseUnits >= middle.multiplier) {
        const midCount = (totalBaseUnits / middle.multiplier).toFixed(1);
        this.itemSimFullTiers.textContent = `${midCount} ${middle.tierName}`;
      } else {
        this.itemSimFullTiers.textContent = `${totalBaseUnits.toLocaleString()} ${baseCode}`;
      }
    }

    if (this.itemSimTierDetails) {
      if (middle && middle.multiplier > 1) {
        const totalMid = (totalBaseUnits / middle.multiplier).toFixed(1);
        this.itemSimTierDetails.textContent = `Equals ~${totalMid} ${middle.tierName}s`;
      } else {
        this.itemSimTierDetails.textContent = `Atomic stock balance`;
      }
    }

    if (this.itemSimCalloutText) {
      const packagingSummary = UomEngine.formatPackagingBadge(item, totalBaseUnits);
      this.itemSimCalloutText.innerHTML = `Inputting <strong>${inputQty} &times; ${selectedTier?.tierName}</strong> calculates to <strong>${totalBaseUnits.toLocaleString()} ${baseCode}</strong> (${packagingSummary}).`;
    }

    this.initIcons();
  }

  deleteItemUom(itemUomId) {
    const success = store.deleteItemUom(itemUomId);
    if (success) {
      this.renderItemDetail(this.activeDetailItemId);
      this.renderItemsMaster();
      this.showToast('Packaging tier removed from item_uoms table', 'info');
    } else {
      this.showToast('Cannot delete the primary base packaging tier', 'error');
    }
  }

  // ============================================================================
  // MASTER DATA: ITEMS CATALOG TABLE
  // ============================================================================
  renderItemsMaster() {
    const tableBody = document.getElementById('itemsMasterTableBody');
    const items = store.tenantItems;

    if (items.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9" class="text-muted" style="text-align:center; padding:2rem;">No items created in catalog.</td></tr>`;
      return;
    }

    tableBody.innerHTML = items.map(item => {
      const mfr = store.tenantManufacturers.find(m => m.id === item.manufacturerId);
      const uom = store.tenantUoms.find(u => u.id === item.baseUomId);
      const packagingChain = store.getItemPackagingChain(item.id);
      const uomCount = store.getItemUoms(item.id).length;

      return `
        <tr>
          <td>
            <a href="#" onclick="app.openItemDetail('${item.id}'); return false;" class="font-mono text-primary" style="font-weight:700; text-decoration:none;" title="Click to view Item Details & UOMs">
              ${item.sku}
            </a>
          </td>
          <td>
            <a href="#" onclick="app.openItemDetail('${item.id}'); return false;" style="font-weight:700; color:var(--text-main); text-decoration:none;">
              ${item.name}
            </a>
          </td>
          <td><span class="badge badge-subtle">${item.category}</span></td>
          <td>${mfr ? mfr.name : 'N/A'}</td>
          <td><span class="badge badge-primary">${uom ? uom.code : 'SQFT'}</span></td>
          <td>
            <button class="btn btn-xs btn-ghost" onclick="app.openItemDetail('${item.id}')" style="color:var(--accent-cyan); font-weight:600; font-size:0.75rem; padding:0.2rem 0.5rem; background:rgba(6,182,212,0.1); border:1px solid rgba(6,182,212,0.25);" title="Manage Packaging Tiers">
              <i data-lucide="layers" style="width:12px;height:12px;"></i> ${packagingChain} (${uomCount} Tiers)
            </button>
          </td>
          <td><span class="font-mono">$${(item.costPrice || 0).toFixed(2)}</span></td>
          <td><span class="font-mono">${(item.reorderPoint || 0).toLocaleString()}</span></td>
          <td>
            <div style="display:flex; gap:0.35rem; align-items:center;">
              <button class="btn btn-xs btn-primary" onclick="app.openItemDetail('${item.id}')" title="Manage Item UOMs & Conversions">
                <i data-lucide="layers"></i> Manage UOMs
              </button>
              <button class="btn btn-xs btn-secondary" onclick="app.triggerReceiveForItem('${item.id}')" title="Receive Stock">
                <i data-lucide="download"></i>
              </button>
              <button class="btn btn-xs btn-outline" onclick="app.triggerAdjustModal(null, '${item.id}')" title="Pick Stock Out">
                <i data-lucide="package-minus"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    this.initIcons();
  }

  // ============================================================================
  // MASTER DATA: FACILITIES & LOCATIONS
  // ============================================================================
  renderFacilities() {
    const container = document.getElementById('facilitiesHierarchyContainer');
    const facilities = store.tenantFacilities;

    container.innerHTML = facilities.map(fac => {
      const locs = store.tenantLocations.filter(l => l.facilityId === fac.id);
      const isLpn = fac.trackingMode === 'lpn';

      return `
        <div class="facility-card-block">
          <div class="facility-block-header">
            <div class="facility-block-title">
              <i data-lucide="building-2" class="text-primary"></i>
              <span>${fac.code} &mdash; ${fac.name}</span>
              <span class="badge badge-primary">${fac.type.toUpperCase()}</span>
            </div>

            <div class="facility-mode-toggle-group">
              <button class="facility-mode-btn ${isLpn ? 'active lpn-active' : ''}" onclick="app.toggleFacilityTrackingMode('${fac.id}', 'lpn')" title="Enable LPN Pallet Tracking">
                <i data-lucide="qr-code"></i> LPN Mode
              </button>
              <button class="facility-mode-btn ${!isLpn ? 'active summary-active' : ''}" onclick="app.toggleFacilityTrackingMode('${fac.id}', 'summary_only')" title="Lock to Summary Only">
                <i data-lucide="lock"></i> Summary Only
              </button>
            </div>

            <button class="btn btn-xs btn-secondary" onclick="app.triggerAddLocation('${fac.id}')">
              <i data-lucide="plus"></i> Add Bin to ${fac.code}
            </button>
          </div>

          <div class="location-bins-grid">
            ${locs.length === 0 ? '<div class="text-muted" style="font-size:0.8rem;">No bin locations configured in this facility.</div>' : ''}
            ${locs.map(loc => {
              const binLpns = store.tenantLpns.filter(l => l.locationId === loc.id);
              return `
                <div class="location-bin-card">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="bin-code">${loc.code}</span>
                    <span class="badge ${binLpns.length > 0 ? 'badge-success' : 'badge-subtle'}">${binLpns.length} / ${loc.capacity} Plts</span>
                  </div>
                  <span class="bin-name">${loc.name}</span>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
                    <span style="font-size:0.68rem; color:var(--text-dim); text-transform:uppercase;">${loc.zone}</span>
                    <button class="btn btn-ghost btn-xs" onclick="app.printBarcodeTag('${loc.barcode}')" title="Print Bin Label"><i data-lucide="printer"></i></button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  toggleFacilityTrackingMode(facilityId, newMode) {
    const fac = store.tenantFacilities.find(f => f.id === facilityId);
    if (fac) {
      fac.trackingMode = newMode;
      store.save();
      this.renderAll();
      const modeLabel = newMode === 'lpn' ? 'LPN Pallet Tracking' : 'Summary Only (Locked)';
      this.showToast(`Updated ${fac.code} tracking mode to ${modeLabel}`, 'success');
    }
  }

  // ============================================================================
  // MASTER DATA: MANUFACTURERS
  // ============================================================================
  renderManufacturers() {
    const tableBody = document.getElementById('manufacturersTableBody');
    if (!tableBody) return;

    const mfrs = store.tenantManufacturers;
    if (mfrs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center; padding:2rem;">No manufacturers or suppliers recorded yet.</td></tr>`;
      return;
    }

    tableBody.innerHTML = mfrs.map(mfr => {
      const itemsCount = store.tenantItems.filter(i => i.manufacturerId === mfr.id).length;
      const initials = mfr.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
      const linesHtml = (mfr.brandLines || []).map(line => `<span class="badge badge-subtle" style="font-size:0.7rem;">${line}</span>`).join(' ') || '-';

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.6rem;">
              <div class="mfr-avatar" style="width:32px; height:32px; font-size:0.8rem; flex-shrink:0;">${initials}</div>
              <div>
                <strong style="color:var(--text-main); font-size:0.9rem;">${mfr.name}</strong>
              </div>
            </div>
          </td>
          <td><span style="font-weight:600; color:var(--text-main);">${mfr.repName || '-'}</span></td>
          <td><span class="font-mono text-muted" style="font-size:0.8rem;"><i data-lucide="phone" style="width:12px;height:12px;display:inline;"></i> ${mfr.repPhone || '-'}</span></td>
          <td>
            ${mfr.repEmail ? `<a href="mailto:${mfr.repEmail}" class="text-primary" style="font-size:0.8rem; text-decoration:none;"><i data-lucide="mail" style="width:12px;height:12px;display:inline;"></i> ${mfr.repEmail}</a>` : '-'}
          </td>
          <td><span class="badge badge-subtle">${mfr.leadTimeDays || 5} Days</span></td>
          <td><div style="display:flex; flex-wrap:wrap; gap:3px;">${linesHtml}</div></td>
          <td><span class="badge badge-primary">${itemsCount} SKUs</span></td>
          <td>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-xs btn-secondary" onclick="app.showToast('Editing ${mfr.name.replace(/'/g, "\\'")}', 'info')" title="Edit Manufacturer">
                <i data-lucide="edit-2"></i> Edit
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.initIcons();
  }

  // ============================================================================
  // STOCK MOVEMENTS & AUDIT LEDGER
  // ============================================================================
  renderOperations() {
    const tableBody = document.getElementById('fullAuditLogBody');
    const txs = store.tenantTransactions;

    if (txs.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="10" class="text-muted" style="text-align:center; padding:2rem;">No movements recorded.</td></tr>`;
      return;
    }

    tableBody.innerHTML = txs.map(tx => `
      <tr>
        <td><span class="font-mono text-muted" style="font-size:0.75rem;">${tx.timestamp}</span></td>
        <td><span class="font-mono" style="font-size:0.75rem;">${tx.id}</span></td>
        <td><span class="badge ${tx.type.includes('Receive') ? 'badge-success' : (tx.type.includes('Dispatch') || tx.type.includes('Scrap') ? 'badge-warning' : 'badge-primary')}">${tx.type}</span></td>
        <td><strong class="font-mono text-primary">${tx.lpn}</strong></td>
        <td><span class="font-mono">${tx.sku}</span></td>
        <td>${tx.from}</td>
        <td><strong>${tx.to}</strong></td>
        <td><span class="font-mono" style="${tx.qty.startsWith('-') ? 'color:var(--accent-rose); font-weight:700;' : ''}">${tx.qty}</span></td>
        <td><span class="text-muted">${tx.note || '-'}</span></td>
        <td>${tx.user}</td>
      </tr>
    `).join('');
  }

  // ============================================================================
  // SETTINGS & MASTER CONFIGURATION
  // ============================================================================
  renderTenantSettings() {
    // 1. Unified Facilities & Tracking Mode Table in Settings
    const facTableBody = document.getElementById('settingsFacilitiesTableBody');
    if (facTableBody) {
      facTableBody.innerHTML = store.tenantFacilities.map(f => {
        const isLpn = f.trackingMode === 'lpn';
        return `
          <tr>
            <td><strong class="font-mono text-primary">${f.code}</strong></td>
            <td><strong>${f.name}</strong></td>
            <td><span class="badge badge-subtle">${(f.type || 'warehouse').toUpperCase()}</span></td>
            <td><span class="text-muted">${f.address || 'Operational Hub'}</span></td>
            <td>
              <div class="facility-mode-toggle-group" style="margin:0; display:inline-flex; transform:scale(0.9); transform-origin:left center;">
                <button class="facility-mode-btn ${isLpn ? 'active lpn-active' : ''}" onclick="app.toggleFacilityTrackingMode('${f.id}', 'lpn')">
                  <i data-lucide="qr-code"></i> LPN Mode
                </button>
                <button class="facility-mode-btn ${!isLpn ? 'active summary-active' : ''}" onclick="app.toggleFacilityTrackingMode('${f.id}', 'summary_only')">
                  <i data-lucide="lock"></i> Summary Only
                </button>
              </div>
            </td>
            <td>
              <button class="btn btn-ghost btn-xs text-danger" onclick="app.removeFacility('${f.id}')" title="Delete Facility">&times;</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. Units of Measure (UOM) List
    const uoms = store.tenantUoms;
    const uomListEl = document.getElementById('uomEditorList');
    if (uomListEl) {
      uomListEl.innerHTML = uoms.map(uom => `
        <div class="editor-row-item">
          <i data-lucide="layers" style="color:var(--accent-purple);width:16px;height:16px;"></i>
          <div class="editor-field-name">${uom.name}</div>
          <span class="badge badge-primary font-mono">${uom.code}</span>
          <span class="badge badge-subtle">${uom.category}</span>
          ${uom.isBaseDefault ? '<span class="badge badge-success">BASE DEFAULT</span>' : ''}
          <button class="btn btn-ghost btn-xs text-muted" onclick="app.removeUom('${uom.id}')" title="Delete UOM">&times;</button>
        </div>
      `).join('');
    }

    // 3. Manageable Facility Types List
    const ftypes = store.tenantFacilityTypes;
    const ftypesListEl = document.getElementById('facilityTypesEditorList');
    if (ftypesListEl) {
      ftypesListEl.innerHTML = ftypes.map(ft => `
        <div class="editor-row-item">
          <i data-lucide="tag" style="color:var(--accent-cyan);width:16px;height:16px;"></i>
          <div class="editor-field-name">
            ${ft.name}
            <small class="text-muted" style="display:block;font-size:0.72rem;font-weight:normal;">${ft.description || ''}</small>
          </div>
          <span class="badge badge-primary font-mono">${ft.code}</span>
          ${ft.isDefault ? '<span class="badge badge-success">DEFAULT</span>' : ''}
          <button class="btn btn-ghost btn-xs text-muted" onclick="app.removeFacilityType('${ft.id}')" title="Delete Facility Type" ${ft.isDefault ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>&times;</button>
        </div>
      `).join('');
    }

    // 4. Configurable Label Templates List
    const labelTemplates = store.tenantLabelTemplates;
    const lblListEl = document.getElementById('labelTemplatesEditorList');
    if (lblListEl) {
      lblListEl.innerHTML = labelTemplates.map(lbl => `
        <div class="editor-row-item">
          <i data-lucide="printer" style="color:var(--accent-cyan);width:16px;height:16px;"></i>
          <div class="editor-field-name">
            ${lbl.name}
            <small class="text-muted" style="display:block;font-size:0.72rem;font-weight:normal;">
              Type: <strong>${lbl.type.replace('_', ' ').toUpperCase()}</strong> &bull; Size: ${lbl.widthIn}x${lbl.heightIn} ${lbl.unit}
            </small>
          </div>
          <span class="badge badge-primary font-mono">${lbl.widthIn}x${lbl.heightIn}"</span>
          ${lbl.includeQr ? '<span class="badge badge-subtle">QR</span>' : ''}
          ${lbl.includeBarcode ? '<span class="badge badge-subtle">1D Barcode</span>' : ''}
          ${lbl.isDefault ? '<span class="badge badge-success">DEFAULT</span>' : ''}
          <button class="btn btn-ghost btn-xs text-muted" onclick="app.removeLabelTemplate('${lbl.id}')" title="Delete Label Size" ${lbl.isDefault ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>&times;</button>
        </div>
      `).join('');
    }

    // 5. Custom Fields List
    const udfs = store.tenantCustomFields;
    const udfListEl = document.getElementById('customFieldsEditorList');
    if (udfListEl) {
      udfListEl.innerHTML = udfs.map(udf => `
        <div class="editor-row-item">
          <i data-lucide="grip-vertical" style="color:var(--text-dim);width:16px;height:16px;"></i>
          <div class="editor-field-name">${udf.label} <small class="font-mono text-muted" style="font-size:0.7rem;">(${udf.key})</small></div>
          <span class="editor-field-type">${udf.type.toUpperCase()}</span>
          <span class="badge ${udf.required ? 'badge-warning' : 'badge-subtle'}">${udf.required ? 'Required' : 'Optional'}</span>
          <button class="btn btn-ghost btn-xs text-muted" onclick="app.removeCustomField('${udf.id}')" title="Delete Field">&times;</button>
        </div>
      `).join('');
    }

    this.initIcons();
  }

  removeFacility(facilityId) {
    if (store.tenantFacilities.length <= 1) {
      this.showToast('Cannot delete the only facility for this tenant', 'error');
      return;
    }
    store.state.facilities[store.state.activeTenantId] = store.tenantFacilities.filter(f => f.id !== facilityId);
    store.save();
    this.renderAll();
    this.showToast('Facility removed', 'info');
  }

  removeFacilityType(typeId) {
    const ftypes = store.tenantFacilityTypes;
    const target = ftypes.find(f => f.id === typeId);
    if (target && target.isDefault) {
      this.showToast('Cannot delete default system facility type', 'warning');
      return;
    }
    if (ftypes.length <= 1) {
      this.showToast('Cannot delete the only facility type for this tenant', 'error');
      return;
    }
    store.state.facilityTypes[store.state.activeTenantId] = ftypes.filter(f => f.id !== typeId);
    store.save();
    this.renderTenantSettings();
    this.populateModalSelects();
    this.showToast('Facility type removed', 'info');
  }

  removeLabelTemplate(templateId) {
    const templates = store.tenantLabelTemplates;
    const target = templates.find(l => l.id === templateId);
    if (target && target.isDefault) {
      this.showToast('Cannot delete default system label template', 'warning');
      return;
    }
    if (templates.length <= 1) {
      this.showToast('Cannot delete the only label template for this tenant', 'error');
      return;
    }
    store.state.labelTemplates[store.state.activeTenantId] = templates.filter(l => l.id !== templateId);
    store.save();
    this.renderTenantSettings();
    this.showToast('Label template removed', 'info');
  }

  removeUom(uomId) {
    store.state.unitsOfMeasure[store.state.activeTenantId] = store.tenantUoms.filter(u => u.id !== uomId);
    store.save();
    this.renderAll();
    this.showToast('Unit of Measure removed', 'info');
  }

  removeCustomField(udfId) {
    store.state.customFields[store.state.activeTenantId] = store.tenantCustomFields.filter(u => u.id !== udfId);
    store.save();
    this.renderTenantSettings();
    this.renderInventory();
    this.showToast('Removed custom field', 'info');
  }

  // ============================================================================
  // USER MANAGEMENT & ROLE-BASED ACCESS CONTROL (RBAC)
  // ============================================================================
  renderUsers() {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    const isMaster = this.isMasterAdmin();
    const orgFilterWrapper = document.getElementById('userOrgFilterWrapper');
    const orgFilterSelect = document.getElementById('userOrgFilterSelect');
    const thOrg = document.getElementById('thUserOrgColumn');

    let selectedOrg = 'all';
    if (isMaster) {
      if (orgFilterWrapper) orgFilterWrapper.style.display = 'flex';
      if (thOrg) thOrg.style.display = 'table-cell';
      
      if (orgFilterSelect) {
        const prevVal = orgFilterSelect.value || 'all';
        orgFilterSelect.innerHTML = `
          <option value="all" ${prevVal === 'all' ? 'selected' : ''}>🌐 All Organizations (Global)</option>
          ${store.state.tenants.map(t => `<option value="${t.id}" ${prevVal === t.id ? 'selected' : ''}>🏢 ${t.name}</option>`).join('')}
        `;
        selectedOrg = orgFilterSelect.value;
      }
    } else {
      if (orgFilterWrapper) orgFilterWrapper.style.display = 'none';
      if (thOrg) thOrg.style.display = 'none';
      selectedOrg = store.state.activeTenantId;
    }

    let usersToRender = [];
    if (isMaster && selectedOrg === 'all') {
      // Gather all users from all tenants in memory
      for (const [tId, uList] of Object.entries(store.state.users || {})) {
        (uList || []).forEach(u => {
          if (!usersToRender.some(existing => existing.id === u.id || (u.email && existing.email === u.email) || (u.username && existing.username === u.username))) {
            usersToRender.push({
              ...u,
              tenantId: u.tenantId || tId
            });
          }
        });
      }
      // Also include tenant admin accounts
      store.state.tenants.forEach(t => {
        if (t.adminUser && t.adminUser.email) {
          const exists = usersToRender.some(u => (u.email && u.email.toLowerCase() === t.adminUser.email.toLowerCase()) || (u.username && u.username.toLowerCase() === (t.adminUser.username || '').toLowerCase()));
          if (!exists) {
            usersToRender.push({
              id: `admin-${t.id}`,
              name: t.adminUser.name,
              email: t.adminUser.email,
              username: t.adminUser.username || t.adminUser.email.split('@')[0],
              role: t.adminUser.role || 'Company Admin',
              facilities: 'All Facilities',
              status: 'Active',
              tenantId: t.id
            });
          }
        }
      });
    } else {
      const targetTenantId = (isMaster && selectedOrg !== 'all') ? selectedOrg : store.state.activeTenantId;
      usersToRender = (store.state.users[targetTenantId] || []).map(u => ({ ...u, tenantId: targetTenantId }));
    }

    const roleBadgeClasses = {
      'Master Admin': 'badge-master-admin',
      'Company Admin': 'badge-primary',
      'Warehouse Manager': 'badge-accent',
      'Warehouse Operator': 'badge-warning',
      'Viewer / Auditor': 'badge-subtle'
    };

    if (usersToRender.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="${isMaster ? 7 : 6}" style="text-align:center; padding:2rem; color:var(--text-muted);">
            <i data-lucide="users" style="width:32px;height:32px;margin-bottom:0.5rem;display:inline-block;opacity:0.5;"></i>
            <p>No team members found for this scope. Click <strong>Invite Team Member</strong> to add users.</p>
          </td>
        </tr>
      `;
      this.initIcons();
      return;
    }

    tableBody.innerHTML = usersToRender.map(usr => {
      const tenantObj = store.state.tenants.find(t => t.id === usr.tenantId);
      const tenantName = tenantObj ? tenantObj.name : usr.tenantId || 'Primary Org';

      return `
        <tr>
          <td><strong>${usr.name}</strong></td>
          <td>
            <span class="text-muted">${usr.email || '-' }</span>
            ${usr.username ? `<small class="font-mono text-primary" style="display:block;font-size:0.75rem;">@${usr.username}</small>` : ''}
          </td>
          ${isMaster ? `<td><span class="badge badge-subtle font-mono" style="font-size:0.75rem;"><i data-lucide="building" style="width:11px;height:11px;margin-right:3px;"></i>${tenantName}</span></td>` : ''}
          <td><span class="badge ${roleBadgeClasses[usr.role] || 'badge-primary'}">${usr.role}</span></td>
          <td><span class="badge badge-subtle font-mono">${usr.facilities || 'All Facilities'}</span></td>
          <td><span class="badge badge-success">${usr.status || 'Active'}</span></td>
          <td>
            <div style="display:flex; gap:0.25rem; align-items:center;">
              <button class="btn btn-ghost btn-xs text-muted" onclick="app.openChangePasswordModal('${usr.id}')" title="Reset User Password">
                <i data-lucide="key" style="width:14px;height:14px;"></i>
              </button>
              <button class="btn btn-ghost btn-xs text-danger" onclick="app.removeUser('${usr.id}')" title="Remove User">&times;</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.initIcons();
  }

  // ============================================================================
  // MASTER ADMIN - CLIENT ORGANIZATIONS MANAGEMENT
  // ============================================================================
  renderMasterTenants() {
    const tableBody = document.getElementById('masterTenantsTableBody');
    if (!tableBody) return;

    const tenants = store.state.tenants || [];
    const totalTenantsEl = document.getElementById('statMasterTotalTenants');
    const totalFacsEl = document.getElementById('statMasterTotalFacilities');
    const totalUsersEl = document.getElementById('statMasterTotalUsers');
    const totalTenantsBadge = document.getElementById('totalTenantsBadge');
    const cloudStatusEl = document.getElementById('statMasterCloudStatus');

    // Calculate aggregated platform metrics
    let totalFacs = 0;
    let totalUsers = 0;
    Object.values(store.state.facilities || {}).forEach(list => { totalFacs += (list?.length || 0); });
    Object.values(store.state.users || {}).forEach(list => { totalUsers += (list?.length || 0); });

    if (totalTenantsEl) totalTenantsEl.textContent = tenants.length;
    if (totalTenantsBadge) totalTenantsBadge.textContent = tenants.length;
    if (totalFacsEl) totalFacsEl.textContent = totalFacs;
    if (totalUsersEl) totalUsersEl.textContent = totalUsers;
    if (cloudStatusEl) {
      cloudStatusEl.textContent = window.supabaseService?.isConnected ? 'Supabase Live Connected' : 'Local Storage Mode';
    }

    tableBody.innerHTML = tenants.map(t => {
      const facCount = (store.state.facilities?.[t.id] || []).length;
      const userCount = (store.state.users?.[t.id] || []).length;
      const adminEmail = t.adminUser?.email || t.adminUser?.username || 'Not set';
      const isCurrent = t.id === store.state.activeTenantId;

      return `
        <tr style="${isCurrent ? 'background: rgba(37, 99, 235, 0.08);' : ''}">
          <td>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <i data-lucide="building" style="width: 16px; height: 16px; color: var(--accent-primary);"></i>
              <div>
                <strong>${t.name}</strong>
                ${isCurrent ? '<span class="badge badge-primary badge-xs" style="margin-left: 0.35rem;">Active Workspace</span>' : ''}
              </div>
            </div>
          </td>
          <td>
            <span class="badge badge-subtle font-mono">${t.id}</span>
            <small class="text-muted" style="display: block; font-size: 0.72rem;">/${t.slug || t.id}</small>
          </td>
          <td><span class="badge badge-accent">${t.tier || 'Enterprise Tier'}</span></td>
          <td><span class="badge badge-subtle">${facCount} Facilities</span></td>
          <td><span class="badge badge-subtle">${userCount} Users</span></td>
          <td>
            <span class="text-muted" style="font-size: 0.85rem;">${t.adminUser?.name || 'Administrator'}</span>
            <small class="text-primary font-mono" style="display: block; font-size: 0.72rem;">${adminEmail}</small>
          </td>
          <td><span class="badge badge-success">Active</span></td>
          <td>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              ${isCurrent ? `
                <button class="btn btn-xs btn-secondary" disabled>
                  <i data-lucide="check"></i> Active
                </button>
              ` : `
                <button class="btn btn-xs btn-primary btn-glow" onclick="app.switchToTenant('${t.id}')">
                  <i data-lucide="log-in"></i> Switch
                </button>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.initIcons();
  }

  async switchToTenant(tenantId) {
    const targetTenant = store.state.tenants.find(t => t.id === tenantId);
    if (!targetTenant) return;

    store.state.activeTenantId = tenantId;
    const facilities = store.tenantFacilities;
    if (facilities.length > 0) {
      store.state.activeFacilityId = facilities[0].id;
    }
    store.save();
    this.renderAll();
    this.navigateTo('dashboard');
    this.showToast(`Switched to workspace: ${targetTenant.name}`, 'success');

    if (window.supabaseService && window.supabaseService.isConnected) {
      await this.syncWithCloud();
      window.supabaseService.subscribeRealtime(store.state.activeTenantId, (table, payload) => {
        this.renderAll();
      });
    }
  }

  async handleProvisionTenantSubmit() {
    const name = document.getElementById('provisionTenantName').value.trim();
    const tenantId = document.getElementById('provisionTenantId').value.trim().toLowerCase();
    const slug = document.getElementById('provisionTenantSlug').value.trim().toLowerCase();
    const tier = document.getElementById('provisionTenantTier').value;
    const template = document.getElementById('provisionTenantTemplate').value;

    const facilityName = document.getElementById('provisionFacilityName').value.trim();
    const facilityCode = document.getElementById('provisionFacilityCode').value.trim().toUpperCase();
    const facilityAddress = document.getElementById('provisionFacilityAddress').value.trim();
    const trackingMode = document.getElementById('provisionTrackingMode').value;

    const adminName = document.getElementById('provisionAdminName').value.trim();
    const adminEmail = document.getElementById('provisionAdminEmail').value.trim();
    const adminUsername = document.getElementById('provisionAdminUsername').value.trim().toLowerCase();

    const seedUoms = document.getElementById('provisionSeedUoms').checked;
    const seedFacTypes = document.getElementById('provisionSeedFacTypes').checked;
    const seedLabels = document.getElementById('provisionSeedLabels').checked;

    if (!name || !tenantId || !slug || !facilityName || !adminName || !adminUsername) {
      this.showToast('Please fill in all required fields.', 'warning');
      return;
    }

    if (store.state.tenants.some(t => t.id === tenantId)) {
      this.showToast(`Tenant ID "${tenantId}" already exists. Please choose a unique identifier.`, 'error');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitProvisionTenant');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Provisioning Client...';
    }

    try {
      // 1. Provision in Supabase if connected
      if (window.supabaseService && window.supabaseService.isConnected) {
        const res = await window.supabaseService.provisionNewTenant({
          tenantId,
          name,
          slug,
          tier,
          template,
          facilityName,
          facilityCode,
          facilityAddress,
          trackingMode,
          adminName,
          adminEmail,
          adminUsername,
          seedUoms,
          seedFacilityTypes: seedFacTypes,
          seedLabelTemplates: seedLabels
        });

        if (!res.success) {
          throw new Error(res.error || 'Failed to provision tenant in Supabase.');
        }
      }

      // 2. Provision locally in store.state
      const newTenantObj = {
        id: tenantId,
        name,
        slug,
        tier,
        template,
        code: slug.toUpperCase().slice(0, 4),
        adminUser: {
          username: adminUsername,
          email: adminEmail,
          name: adminName,
          role: 'Company Admin',
          password: null
        }
      };

      store.state.tenants.push(newTenantObj);

      const defaultFacId = `fac-${tenantId}-main`;
      store.state.facilities[tenantId] = [
        {
          id: defaultFacId,
          code: facilityCode,
          name: facilityName,
          type: 'warehouse',
          address: facilityAddress,
          trackingMode: trackingMode
        }
      ];

      store.state.locations[tenantId] = [
        { id: `loc-${tenantId}-dock`, facilityId: defaultFacId, code: 'RECEIVING-01', name: 'Inbound Dock 1', zone: 'DOCK', capacity: 50, barcode: 'LOC-DOCK-01' },
        { id: `loc-${tenantId}-rack1`, facilityId: defaultFacId, code: 'A-01-01', name: 'Aisle A Rack 1 Tier 1', zone: 'BULK', capacity: 20, barcode: 'LOC-A0101' }
      ];

      store.state.items[tenantId] = [];
      store.state.licensePlates[tenantId] = [];
      store.state.transactions[tenantId] = [];

      if (seedUoms) {
        store.state.unitsOfMeasure[tenantId] = [
          { id: `uom-${tenantId}-ea`, name: 'Each / Unit', code: 'EA', category: 'count', isBaseDefault: true },
          { id: `uom-${tenantId}-cs`, name: 'Case / Box', code: 'CS', category: 'count', isBaseDefault: false },
          { id: `uom-${tenantId}-plt`, name: 'Pallet (PLT)', code: 'PLT', category: 'count', isBaseDefault: false },
          { id: `uom-${tenantId}-lbs`, name: 'Pounds (Lbs)', code: 'LBS', category: 'weight', isBaseDefault: false },
          { id: `uom-${tenantId}-sqft`, name: 'Square Feet', code: 'SQFT', category: 'area', isBaseDefault: false }
        ];
      }

      if (seedFacTypes) {
        store.state.facilityTypes[tenantId] = [
          { id: `ftype-${tenantId}-wh`, code: 'warehouse', name: 'Main Warehouse / DC', description: 'Central distribution hub', isDefault: true },
          { id: `ftype-${tenantId}-dock`, code: 'cross_dock', name: 'Cross-Dock Terminal', description: 'Fast transit facility', isDefault: false },
          { id: `ftype-${tenantId}-cold`, code: 'cold_storage', name: 'Cold Storage', description: 'Temperature-controlled', isDefault: false }
        ];
      }

      if (seedLabels) {
        store.state.labelTemplates[tenantId] = [
          { id: `lbl-${tenantId}-4x6-pallet`, name: 'Standard 4x6" Pallet LPN Tag', type: 'lpn_pallet', widthIn: 4.0, heightIn: 6.0, unit: 'in', isDefault: true, includeQr: true, includeBarcode: true, includeLot: true },
          { id: `lbl-${tenantId}-2x1-bin`, name: 'Rack / Shelf Bin Marker (2x1")', type: 'bin_location', widthIn: 2.0, heightIn: 1.0, unit: 'in', isDefault: true, includeQr: true, includeBarcode: false, includeLot: false },
          { id: `lbl-${tenantId}-3x1-sku`, name: 'Item Carton Barcode (3x1")', type: 'item_sku', widthIn: 3.0, heightIn: 1.0, unit: 'in', isDefault: true, includeQr: false, includeBarcode: true, includeLot: false },
          { id: `lbl-${tenantId}-85x11-slip`, name: 'Packing Sheet & Dispatch Slip (8.5x11")', type: 'dispatch_slip', widthIn: 8.5, heightIn: 11.0, unit: 'in', isDefault: false, includeQr: true, includeBarcode: true, includeLot: true }
        ];
      }

      store.state.users[tenantId] = [
        {
          id: `usr-${tenantId}-admin`,
          username: adminUsername,
          email: adminEmail,
          password: null,
          name: adminName,
          role: 'Company Admin',
          facilities: 'All Facilities',
          status: 'Active'
        }
      ];

      // 3. Switch into new tenant
      store.state.activeTenantId = tenantId;
      store.state.activeFacilityId = defaultFacId;
      store.save();

      this.closeModal('provisionTenantModal');
      document.getElementById('provisionTenantForm').reset();
      delete document.getElementById('provisionTenantId').dataset.manual;
      delete document.getElementById('provisionTenantSlug').dataset.manual;

      this.renderAll();
      this.navigateTo('dashboard');
      this.showToast(`🎉 Successfully provisioned ${name}! Switched to new workspace.`, 'success');

    } catch (err) {
      console.error('Provisioning error:', err);
      this.showToast(`Provisioning failed: ${err.message || err}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="rocket"></i> Create & Provision Client';
        this.initIcons();
      }
    }
  }

  openChangePasswordModal(targetUserId = null, isMandatoryFirstTime = false) {
    this.isMandatoryPasswordSetup = isMandatoryFirstTime;

    const hiddenId = document.getElementById('changePasswordUserId');
    const groupCurrent = document.getElementById('groupCurrentPassword');
    const currentInput = document.getElementById('currentPasswordInput');
    const titleEl = document.getElementById('changePasswordModalTitle');
    const helperText = document.getElementById('changePasswordHelperText');
    const closeBtn = document.getElementById('changePasswordModalCloseBtn');
    const cancelBtn = document.getElementById('btnCancelChangePassword');
    const submitBtn = document.getElementById('btnSubmitChangePassword');
    const form = document.getElementById('changePasswordForm');
    if (form) form.reset();

    const isSelf = !targetUserId || (store.currentUser && store.currentUser.id === targetUserId);

    if (hiddenId) hiddenId.value = targetUserId || '';

    if (isMandatoryFirstTime) {
      if (titleEl) titleEl.textContent = '🔒 Set Your Permanent Password';
      if (helperText) {
        helperText.style.display = 'block';
        helperText.textContent = 'Welcome to Simpletory! Please create a secure permanent password for your account to complete setup.';
      }
      if (groupCurrent) groupCurrent.style.display = 'none';
      if (currentInput) currentInput.required = false;
      if (closeBtn) closeBtn.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
      if (submitBtn) submitBtn.textContent = 'Set Password & Enter Workspace';
    } else {
      if (helperText) helperText.style.display = 'none';
      if (closeBtn) closeBtn.style.display = 'block';
      if (cancelBtn) cancelBtn.style.display = 'inline-block';
      if (submitBtn) submitBtn.textContent = 'Update Password';

      if (isSelf) {
        if (titleEl) titleEl.textContent = 'Change Your Password';
        if (groupCurrent) groupCurrent.style.display = 'block';
        if (currentInput) currentInput.required = true;
      } else {
        const targetUser = store.tenantUsers.find(u => u.id === targetUserId);
        if (titleEl) titleEl.textContent = `Reset Password for ${targetUser ? targetUser.name : 'User'}`;
        if (groupCurrent) groupCurrent.style.display = 'none';
        if (currentInput) currentInput.required = false;
      }
    }

    this.openModal('changePasswordModal');
  }

  openInviteUserModal() {
    const isMaster = this.isMasterAdmin();
    const orgGroup = document.getElementById('inviteUserOrgGroup');
    const orgSelect = document.getElementById('inviteUserOrgSelect');
    const facSelect = document.getElementById('inviteUserFacility');

    const updateFacilitiesForTenant = (tId) => {
      if (!facSelect) return;
      const targetFacs = store.state.facilities[tId] || [];
      facSelect.innerHTML = `
        <option value="All Facilities">All Facilities (Global Scope)</option>
        ${targetFacs.map(f => `<option value="${f.code} ${f.name}">${f.code} - ${f.name}</option>`).join('')}
      `;
    };

    if (isMaster) {
      if (orgGroup) orgGroup.style.display = 'block';
      if (orgSelect) {
        orgSelect.innerHTML = store.state.tenants.map(t => `
          <option value="${t.id}" ${t.id === store.state.activeTenantId ? 'selected' : ''}>🏢 ${t.name}</option>
        `).join('');
        orgSelect.onchange = (e) => updateFacilitiesForTenant(e.target.value);
        updateFacilitiesForTenant(orgSelect.value || store.state.activeTenantId);
      }
    } else {
      if (orgGroup) orgGroup.style.display = 'none';
      updateFacilitiesForTenant(store.state.activeTenantId);
    }

    const nameInput = document.getElementById('inviteUserName');
    const emailInput = document.getElementById('inviteUserEmail');
    const userInput = document.getElementById('inviteUserUsername');
    const passInput = document.getElementById('inviteUserPassword');
    if (nameInput) nameInput.value = '';
    if (emailInput) emailInput.value = '';
    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';
    this.openModal('inviteUserModal');
  }

  // ============================================================================
  // AUTHENTICATION & ACCESS CONTROL
  // ============================================================================
  async login(identifier, password) {
    if (!identifier) {
      this.showToast('Please enter your username or email address.', 'warning');
      return;
    }

    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = (password || '').trim();
    let matchedUser = null;
    let matchedTenantId = null;
    let needsFirstTimePassword = false;

    // 1. First check Supabase PostgreSQL if connected
    if (window.supabaseService && window.supabaseService.isConnected && window.supabaseService.client) {
      try {
        const { data, error } = await window.supabaseService.client
          .from('user_profiles')
          .select('*')
          .or(`username.ilike.${cleanId},email.ilike.${cleanId}`)
          .limit(1);

        if (!error && data && data.length > 0) {
          const u = data[0];
          if (!u.password_hash) {
            needsFirstTimePassword = true;
          }
          // Check password if configured, or allow first-time setup if null
          if (!u.password_hash || (cleanPass && cleanPass === u.password_hash)) {
            matchedUser = {
              id: u.id,
              username: u.username || cleanId,
              email: u.email,
              password: u.password_hash || null,
              name: u.name || cleanId,
              role: u.role || 'Warehouse Operator',
              facilities: u.all_facilities_access ? 'All Facilities' : (u.facility_id || 'Assigned Facility'),
              status: u.status || 'Active',
              tenantId: u.tenant_id
            };
            matchedTenantId = u.tenant_id;
          } else {
            this.showToast('Invalid password. Please check your credentials.', 'error');
            return;
          }
        }
      } catch (err) {
        console.warn('Supabase auth lookup error:', err);
      }
    }

    // 2. Fallback to local store users
    if (!matchedUser) {
      for (const [tId, uList] of Object.entries(store.state.users)) {
        const found = uList.find(u => 
          (u.username && u.username.toLowerCase() === cleanId) || 
          (u.email && u.email.toLowerCase() === cleanId)
        );
        if (found) {
          if (!found.password) {
            needsFirstTimePassword = true;
          }
          if (!found.password || (cleanPass && cleanPass === found.password)) {
            matchedUser = found;
            matchedTenantId = tId;
            break;
          } else {
            this.showToast('Invalid password. Please check your credentials.', 'error');
            return;
          }
        }
      }
    }

    // 3. Fallback to tenant admin user
    if (!matchedUser) {
      const tMatch = store.state.tenants.find(t => 
        (t.adminUser && t.adminUser.email && t.adminUser.email.toLowerCase() === cleanId) ||
        (t.adminUser && t.adminUser.username && t.adminUser.username.toLowerCase() === cleanId)
      );
      if (tMatch) {
        if (!tMatch.adminUser.password) {
          needsFirstTimePassword = true;
        }
        if (!tMatch.adminUser.password || (cleanPass && cleanPass === tMatch.adminUser.password)) {
          matchedUser = {
            id: `admin-${tMatch.id}`,
            username: cleanId.includes('@') ? cleanId.split('@')[0] : cleanId,
            email: tMatch.adminUser.email,
            name: tMatch.adminUser.name,
            role: tMatch.adminUser.role || 'Company Admin',
            password: tMatch.adminUser.password || null
          };
          matchedTenantId = tMatch.id;
        } else {
          this.showToast('Invalid password. Please check your credentials.', 'error');
          return;
        }
      }
    }

    if (!matchedUser) {
      this.showToast('Access restricted: Invalid credentials. Only invited or pre-provisioned enterprise accounts may sign in.', 'error');
      return;
    }

    // Set active session
    matchedUser.tenantId = matchedTenantId;
    store.state.currentAuthUser = matchedUser;
    store.state.activeTenantId = matchedTenantId;
    const facs = store.tenantFacilities;
    if (facs.length > 0 && !store.state.activeFacilityId) {
      store.state.activeFacilityId = facs[0].id;
    }
    store.save();

    // Close auth gate modal
    const authModalEl = document.getElementById('authModal');
    if (authModalEl) authModalEl.classList.remove('open');

    this.renderAll();

    // Sync tenant data from Supabase if connected
    if (window.supabaseService && window.supabaseService.isConnected) {
      await this.syncWithCloud();
    }

    // Mandatory first-time password creation check
    if (needsFirstTimePassword || !matchedUser.password) {
      this.openChangePasswordModal(matchedUser.id, true);
      this.showToast(`Welcome, ${matchedUser.name}! Please set your account password to continue.`, 'info');
    } else {
      this.showToast(`Welcome back, ${matchedUser.name}! (${matchedUser.role})`, 'success');
    }
  }

  logout() {
    store.state.currentAuthUser = null;
    store.save();
    this.openModal('authModal');
    this.showToast('Signed out. Please sign in with your enterprise credentials.', 'info');
  }

  editUserRole(userId) {
    const user = store.tenantUsers.find(u => u.id === userId);
    if (!user) return;
    const newRole = prompt(`Update role for ${user.name} (Current: ${user.role}):\n1. Company Admin\n2. Warehouse Manager\n3. Warehouse Operator\n4. Viewer / Auditor`, user.role);
    if (newRole && ['Company Admin', 'Warehouse Manager', 'Warehouse Operator', 'Viewer / Auditor'].includes(newRole.trim())) {
      user.role = newRole.trim();
      store.save();
      this.renderUsers();
      this.showToast(`Updated role for ${user.name} to ${user.role}`, 'success');
    }
  }

  removeUser(userId) {
    if (store.tenantUsers.length <= 1) {
      this.showToast('Cannot remove the only admin user', 'error');
      return;
    }
    store.state.users[store.state.activeTenantId] = store.tenantUsers.filter(u => u.id !== userId);
    store.save();
    this.renderUsers();
    this.showToast('Team member removed', 'info');
  }

  // ============================================================================
  // MODALS & HELPERS
  // ============================================================================
  populateModalSelects() {
    const items = store.tenantItems;
    const facilities = store.tenantFacilities;
    const locations = store.tenantLocations;
    const mfrs = store.tenantManufacturers;
    const uoms = store.tenantUoms;
    const lpns = store.tenantLpns;

    const rcvItemSel = document.getElementById('rcvItemSelect');
    if (rcvItemSel) {
      rcvItemSel.innerHTML = items.map(i => `<option value="${i.id}">${i.sku} - ${i.name}</option>`).join('');
    }

    const rcvFacSel = document.getElementById('rcvFacilitySelect');
    if (rcvFacSel) {
      rcvFacSel.innerHTML = facilities.map(f => `<option value="${f.id}">${f.code} - ${f.name}</option>`).join('');
    }

    const rcvLocSel = document.getElementById('rcvLocationSelect');
    if (rcvLocSel) {
      rcvLocSel.innerHTML = locations.map(l => `<option value="${l.id}">${l.code} (${l.name})</option>`).join('');
    }

    this.populateRcvUoms();

    // Populate Dispatch Modal
    const dspItemSel = document.getElementById('dspItemSelect');
    if (dspItemSel) {
      dspItemSel.innerHTML = items.map(i => `<option value="${i.id}">${i.sku} - ${i.name}</option>`).join('');
    }
    const dspLocSel = document.getElementById('dspLocationSelect');
    if (dspLocSel) {
      dspLocSel.innerHTML = locations.map(l => `<option value="${l.id}">${l.code} (${l.name})</option>`).join('');
    }
    this.populateDspUoms();

    // Populate Adjust Modal
    const adjInvItemSel = document.getElementById('adjInvItemSelect');
    if (adjInvItemSel) {
      adjInvItemSel.innerHTML = items.map(i => `<option value="${i.id}">${i.sku} - ${i.name}</option>`).join('');
    }
    const adjInvLocSel = document.getElementById('adjInvLocationSelect');
    if (adjInvLocSel) {
      adjInvLocSel.innerHTML = locations.map(l => `<option value="${l.id}">${l.code} (${l.name})</option>`).join('');
    }
    this.populateAdjInvUoms();

    const rcvUdfContainer = document.getElementById('rcvCustomFieldsInputs');
    if (rcvUdfContainer) {
      rcvUdfContainer.innerHTML = store.tenantCustomFields.map(udf => `
        <div class="form-group">
          <label class="form-label">${udf.label}: ${udf.required ? '*' : ''}</label>
          <input type="${udf.type === 'number' ? 'number' : 'text'}" id="rcv_udf_${udf.key}" class="form-input" placeholder="e.g. ${udf.label}" ${udf.required ? 'required' : ''} />
        </div>
      `).join('');
    }

    const newItemMfr = document.getElementById('newItemManufacturer');
    if (newItemMfr) {
      newItemMfr.innerHTML = mfrs.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
    }
    const newItemBaseUom = document.getElementById('newItemBaseUom');
    if (newItemBaseUom) {
      newItemBaseUom.innerHTML = uoms.map(u => `<option value="${u.id}">${u.name} (${u.code})</option>`).join('');
    }

    const itemUdfContainer = document.getElementById('newItemCustomFieldsContainer');
    if (itemUdfContainer) {
      itemUdfContainer.innerHTML = store.tenantCustomFields.map(udf => `
        <div class="form-group">
          <label class="form-label">${udf.label}:</label>
          <input type="${udf.type === 'number' ? 'number' : 'text'}" id="item_udf_${udf.key}" class="form-input" placeholder="e.g. Value for ${udf.label}" />
        </div>
      `).join('');
    }

    const moveLpnSel = document.getElementById('moveLpnSelect');
    if (moveLpnSel) {
      moveLpnSel.innerHTML = lpns.map(l => {
        const item = items.find(i => i.id === l.itemId);
        return `<option value="${l.id}">${l.lpnNumber} - ${item ? item.sku : ''} (${l.quantityBase} units)</option>`;
      }).join('');
    }

    const moveDestFacSel = document.getElementById('moveDestFacilitySelect');
    if (moveDestFacSel) {
      moveDestFacSel.innerHTML = facilities.map(f => `<option value="${f.id}">${f.code} - ${f.name}</option>`).join('');
    }

    const moveDestLocSel = document.getElementById('moveDestLocationSelect');
    if (moveDestLocSel) {
      moveDestLocSel.innerHTML = locations.map(l => `<option value="${l.id}">${l.code} (${l.name})</option>`).join('');
    }

    const newLocFacSel = document.getElementById('newLocFacilitySelect');
    if (newLocFacSel) {
      newLocFacSel.innerHTML = facilities.map(f => `<option value="${f.id}">${f.code} - ${f.name}</option>`).join('');
    }

    const newFacTypeSel = document.getElementById('newFacilityType');
    if (newFacTypeSel) {
      newFacTypeSel.innerHTML = store.tenantFacilityTypes.map(ft => `<option value="${ft.code}">${ft.name} (${ft.code})</option>`).join('');
    }
  }

  populateRcvUoms() {
    const itemSel = document.getElementById('rcvItemSelect');
    const uomSel = document.getElementById('rcvUomSelect');
    if (!itemSel || !uomSel) return;
    const itemId = itemSel.value || store.tenantItems[0]?.id;
    if (!itemId) return;

    const itemUoms = store.getItemUoms(itemId);
    const baseUom = store.getItemBaseUom(itemId);

    uomSel.innerHTML = itemUoms.map(tier => {
      return `<option value="${tier.id}">1 ${tier.tierName} (${tier.multiplier} ${baseUom?.code || 'Units'})</option>`;
    }).join('');

    if (itemUoms.length > 1) {
      uomSel.value = itemUoms[itemUoms.length - 1].id;
    }
  }

  populateDspUoms() {
    const itemSel = document.getElementById('dspItemSelect');
    const uomSel = document.getElementById('dspUomSelect');
    if (!itemSel || !uomSel) return;
    const itemId = itemSel.value || store.tenantItems[0]?.id;
    if (!itemId) return;

    const itemUoms = store.getItemUoms(itemId);
    const baseUom = store.getItemBaseUom(itemId);

    uomSel.innerHTML = itemUoms.map(tier => {
      return `<option value="${tier.id}">1 ${tier.tierName} (${tier.multiplier} ${baseUom?.code || 'Units'})</option>`;
    }).join('');

    if (itemUoms.length > 1) {
      uomSel.value = itemUoms[1].id;
    }
  }

  populateAdjInvUoms() {
    const itemSel = document.getElementById('adjInvItemSelect');
    const uomSel = document.getElementById('adjInvUomSelect');
    if (!itemSel || !uomSel) return;
    const itemId = itemSel.value || store.tenantItems[0]?.id;
    if (!itemId) return;

    const itemUoms = store.getItemUoms(itemId);
    const baseUom = store.getItemBaseUom(itemId);

    uomSel.innerHTML = itemUoms.map(tier => {
      return `<option value="${tier.id}">1 ${tier.tierName} (${tier.multiplier} ${baseUom?.code || 'Units'})</option>`;
    }).join('');

    if (itemUoms.length > 1) {
      uomSel.value = itemUoms[0].id;
    }
  }

  triggerReceiveForItem(itemId) {
    this.openModal('receiveStockModal');
    const itemSel = document.getElementById('rcvItemSelect');
    if (itemSel && itemId) {
      itemSel.value = itemId;
      this.populateRcvUoms();
    }
  }

  triggerDispatchForItem(itemId = null) {
    this.openModal('dispatchStockModal');
    const itemSel = document.getElementById('dspItemSelect');
    if (itemSel && itemId) {
      itemSel.value = itemId;
      this.populateDspUoms();
    }
  }

  triggerAdjustForItem(itemId = null) {
    this.openModal('adjustStockModal');
    const itemSel = document.getElementById('adjInvItemSelect');
    if (itemSel && itemId) {
      itemSel.value = itemId;
      this.populateAdjInvUoms();
    }
  }

  triggerAdjustModal(lpnId = null, itemId = null) {
    if (lpnId && !itemId) {
      const lpn = store.tenantLpns.find(l => l.id === lpnId);
      if (lpn) itemId = lpn.itemId;
    }
    this.triggerAdjustForItem(itemId);
  }

  openModal(modalId) {
    this.populateModalSelects();
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('open');
      this.initIcons();
    }
  }

  closeModal(modalId) {
    if (modalId === 'authModal' && !store.state.currentAuthUser) {
      return; // Enterprise authentication gate is mandatory
    }
    if (modalId === 'changePasswordModal' && this.isMandatoryPasswordSetup) {
      this.showToast('Setting an account password is required before accessing the workspace.', 'warning');
      return; // Mandatory first-time password creation
    }
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('open');
    }
  }

  triggerReceiveForItem(itemId) {
    this.openModal('receiveStockModal');
    const select = document.getElementById('rcvItemSelect');
    if (select) {
      select.value = itemId;
      select.dispatchEvent(new Event('change'));
    }
  }

  triggerMoveModal(lpnId) {
    this.openModal('moveLpnModal');
    const select = document.getElementById('moveLpnSelect');
    if (select) {
      select.value = lpnId;
      select.dispatchEvent(new Event('change'));
    }
  }

  triggerAddLocation(facilityId) {
    this.openModal('addLocationModal');
    const select = document.getElementById('newLocFacilitySelect');
    if (select) {
      select.value = facilityId;
    }
  }

  // ============================================================================
  // AUDIO SYNTHESIZER & BARCODE / QR CODE UTILITIES
  // ============================================================================
  playScanBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Crisp 880Hz chime
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      // AudioContext unavailable or blocked
    }
  }

  renderBarcode(svgElement, text, height = 46) {
    if (!svgElement) return;
    if (typeof JsBarcode === 'function') {
      try {
        JsBarcode(svgElement, String(text).toUpperCase(), {
          format: 'CODE128',
          lineColor: '#000000',
          width: 2,
          height: height,
          displayValue: true,
          font: 'JetBrains Mono',
          fontSize: 13,
          textMargin: 3,
          margin: 0
        });
        return;
      } catch (err) {
        console.warn('JsBarcode render error, falling back to SVG:', err);
      }
    }
    // High-contrast SVG Barcode Fallback
    svgElement.innerHTML = `
      <rect width="100%" height="${height}" fill="#ffffff"/>
      <g fill="#000000">
        <rect x="5" y="0" width="3" height="${height - 14}"/>
        <rect x="11" y="0" width="2" height="${height - 14}"/>
        <rect x="17" y="0" width="4" height="${height - 14}"/>
        <rect x="25" y="0" width="2" height="${height - 14}"/>
        <rect x="31" y="0" width="5" height="${height - 14}"/>
        <rect x="40" y="0" width="2" height="${height - 14}"/>
        <rect x="46" y="0" width="3" height="${height - 14}"/>
        <rect x="54" y="0" width="4" height="${height - 14}"/>
        <rect x="63" y="0" width="2" height="${height - 14}"/>
        <rect x="69" y="0" width="4" height="${height - 14}"/>
        <rect x="78" y="0" width="2" height="${height - 14}"/>
        <rect x="85" y="0" width="5" height="${height - 14}"/>
        <rect x="95" y="0" width="3" height="${height - 14}"/>
        <rect x="103" y="0" width="2" height="${height - 14}"/>
        <rect x="109" y="0" width="4" height="${height - 14}"/>
        <rect x="117" y="0" width="2" height="${height - 14}"/>
        <rect x="123" y="0" width="4" height="${height - 14}"/>
        <rect x="131" y="0" width="3" height="${height - 14}"/>
        <rect x="139" y="0" width="2" height="${height - 14}"/>
        <rect x="145" y="0" width="4" height="${height - 14}"/>
      </g>
      <text x="50%" y="${height}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="11" font-weight="bold" fill="#000000">${text}</text>
    `;
  }

  renderQrCode(containerElement, text, size = 64) {
    if (!containerElement) return;
    containerElement.innerHTML = '';
    if (typeof QRCode === 'function') {
      try {
        new QRCode(containerElement, {
          text: String(text),
          width: size,
          height: size,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
        return;
      } catch (e) {
        console.warn('QRCode render error, falling back to SVG:', e);
      }
    }
    // High-contrast SVG QR Code Fallback
    containerElement.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="#000000" style="display:block;">
        <rect x="10" y="10" width="30" height="30" fill="none" stroke="#000000" stroke-width="8"/>
        <rect x="20" y="20" width="10" height="10"/>
        <rect x="60" y="10" width="30" height="30" fill="none" stroke="#000000" stroke-width="8"/>
        <rect x="70" y="20" width="10" height="10"/>
        <rect x="10" y="60" width="30" height="30" fill="none" stroke="#000000" stroke-width="8"/>
        <rect x="20" y="70" width="10" height="10"/>
        <rect x="52" y="52" width="12" height="12"/>
        <rect x="72" y="60" width="16" height="16"/>
        <rect x="52" y="76" width="12" height="12"/>
        <rect x="76" y="44" width="12" height="12"/>
      </svg>
    `;
  }

  // ============================================================================
  // THERMAL & SHEET LABEL PRINT ENGINE
  // ============================================================================
  openPrintLabelModal(targetType = 'lpn', entityId = null) {
    this.printActiveTarget = targetType;
    this.printActiveEntityId = entityId;

    const targetSel = document.getElementById('printTargetSelect');
    if (targetSel) targetSel.value = targetType;

    this.populatePrintTemplates();
    this.openModal('printLabelModal');
    this.renderLiveLabelPreview();
  }

  populatePrintTemplates() {
    const tmplSel = document.getElementById('printTemplateSelect');
    if (!tmplSel) return;
    const templates = store.tenantLabelTemplates;

    tmplSel.innerHTML = templates.map(t => {
      const isDef = t.isDefault ? ' (Default)' : '';
      return `<option value="${t.id}">${t.name} - ${t.widthIn}" × ${t.heightIn}" (${t.unit})${isDef}</option>`;
    }).join('');

    const defaultTmpl = templates.find(t => t.isDefault) || templates[0];
    if (defaultTmpl) tmplSel.value = defaultTmpl.id;
  }

  getActivePrintTemplate() {
    const tmplId = document.getElementById('printTemplateSelect')?.value;
    return store.tenantLabelTemplates.find(t => t.id === tmplId) || store.tenantLabelTemplates[0] || {
      id: 'default',
      name: 'Standard 4x6" Pallet LPN Tag',
      type: 'lpn_pallet',
      widthIn: 4.0,
      heightIn: 6.0,
      unit: 'in',
      includeQr: true,
      includeBarcode: true,
      includeLot: true
    };
  }

  renderLiveLabelPreview() {
    const previewContainer = document.getElementById('printLabelPreview');
    const dimsBadge = document.getElementById('printActiveDimsBadge');
    const typeBadge = document.getElementById('printActiveTypeBadge');
    const ratioBadge = document.getElementById('previewRatioIndicator');
    if (!previewContainer) return;

    const tmpl = this.getActivePrintTemplate();
    const targetType = document.getElementById('printTargetSelect')?.value || 'lpn';
    const showBarcode = document.getElementById('printOptBarcode')?.checked ?? true;
    const showQr = document.getElementById('printOptQr')?.checked ?? true;
    const showLot = document.getElementById('printOptLot')?.checked ?? true;

    // Update dimensions metadata badge
    const wMm = (tmpl.widthIn * 25.4).toFixed(1);
    const hMm = (tmpl.heightIn * 25.4).toFixed(1);
    if (dimsBadge) dimsBadge.textContent = `${tmpl.widthIn}" × ${tmpl.heightIn}" (${wMm} × ${hMm} mm)`;
    if (typeBadge) typeBadge.textContent = `${tmpl.name} • ${tmpl.unit === 'mm' ? 'Metric' : 'Imperial'}`;
    if (ratioBadge) ratioBadge.textContent = `${tmpl.widthIn}×${tmpl.heightIn}"`;

    // Apply aspect ratio class
    previewContainer.className = 'thermal-label-canvas';
    if (tmpl.widthIn === 2 && tmpl.heightIn === 1) {
      previewContainer.classList.add('landscape-bin');
    } else if (tmpl.widthIn === 3 && tmpl.heightIn === 1) {
      previewContainer.classList.add('landscape-sku');
    } else if (tmpl.widthIn === 8.5 && tmpl.heightIn === 11) {
      previewContainer.classList.add('full-sheet');
    }

    // Resolve active entity data
    let labelData = {};
    if (targetType === 'lpn') {
      const lpn = store.tenantLpns.find(l => l.id === this.printActiveEntityId) || store.tenantLpns[0];
      const item = lpn ? store.tenantItems.find(i => i.id === lpn.itemId) : store.tenantItems[0];
      const loc = lpn ? store.tenantLocations.find(l => l.id === lpn.locationId) : store.tenantLocations[0];
      const fac = lpn ? store.tenantFacilities.find(f => f.id === lpn.facilityId) : store.tenantFacilities[0];
      const baseUom = item ? store.getItemBaseUom(item.id) : null;

      labelData = {
        title: store.activeTenant.name,
        tagType: 'LPN PALLET',
        primaryCode: lpn ? lpn.lpnNumber : 'LPN-100001',
        itemSku: item ? item.sku : 'SKU-001',
        itemName: item ? item.name : 'Standard Product Unit',
        location: loc ? `${fac ? fac.code : ''} • ${loc.code}` : 'A01-R01-A',
        qty: lpn ? `${lpn.quantityBase.toLocaleString()} ${baseUom?.code || 'EA'}` : '100 EA',
        lot: lpn?.customFields?.lot_number || lpn?.customFields?.batch_lot_tag || 'LOT-2026-01',
        barcodeValue: lpn ? lpn.lpnNumber : 'LPN-100001',
        qrValue: JSON.stringify({ t: 'lpn', id: lpn?.lpnNumber || 'LPN-100001', sku: item?.sku, org: store.activeTenant.slug }),
        timestamp: new Date().toLocaleDateString()
      };
    } else if (targetType === 'location') {
      const loc = store.tenantLocations.find(l => l.id === this.printActiveEntityId) || store.tenantLocations[0];
      const fac = loc ? store.tenantFacilities.find(f => f.id === loc.facilityId) : store.tenantFacilities[0];
      labelData = {
        title: store.activeTenant.name,
        tagType: 'BIN LOCATION',
        primaryCode: loc ? loc.code : 'LOC-A01-R01-A',
        itemSku: `Zone: ${loc ? loc.zone.toUpperCase() : 'RACKING'}`,
        itemName: loc ? loc.name : 'Aisle 1, Rack 1, Floor Bay',
        location: fac ? fac.name : 'Main DC',
        qty: `Cap: ${loc ? loc.capacity : 4} Pallets`,
        lot: 'STORAGE BIN',
        barcodeValue: loc ? loc.barcode : 'LOC-A01-R01-A',
        qrValue: JSON.stringify({ t: 'loc', code: loc?.code, fac: fac?.code }),
        timestamp: new Date().toLocaleDateString()
      };
    } else if (targetType === 'sku') {
      const item = store.tenantItems.find(i => i.id === this.printActiveEntityId) || store.tenantItems[0];
      const baseUom = item ? store.getItemBaseUom(item.id) : null;
      labelData = {
        title: store.activeTenant.name,
        tagType: 'ITEM SKU',
        primaryCode: item ? item.sku : 'SKU-001',
        itemSku: item ? item.category : 'General',
        itemName: item ? item.name : 'Standard Item',
        location: 'Base: ' + (baseUom?.name || 'Each'),
        qty: `Cost: $${Number(item?.costPrice || 0).toFixed(2)}`,
        lot: 'Standard',
        barcodeValue: item ? (item.barcode || item.sku) : 'SKU-001',
        qrValue: JSON.stringify({ t: 'sku', sku: item?.sku, uom: baseUom?.code }),
        timestamp: new Date().toLocaleDateString()
      };
    }

    // Render HTML inside preview
    previewContainer.innerHTML = `
      <div class="label-header">
        <span class="label-tenant-title">${labelData.title}</span>
        <span class="label-type-tag">${labelData.tagType}</span>
      </div>

      <div class="label-lpn-hero">${labelData.primaryCode}</div>

      ${showBarcode ? `
        <div class="label-barcode-wrapper">
          <svg id="previewBarcodeSvg" class="label-barcode-svg"></svg>
        </div>
      ` : ''}

      <div class="label-info-grid">
        <div class="label-info-row-full">
          <div class="label-field-label">Product / Description:</div>
          <div class="label-field-val">${labelData.itemName}</div>
        </div>
        <div>
          <div class="label-field-label">SKU / Code:</div>
          <div class="label-field-val font-mono">${labelData.itemSku}</div>
        </div>
        <div>
          <div class="label-field-label">Location / Bin:</div>
          <div class="label-field-val">${labelData.location}</div>
        </div>
        <div>
          <div class="label-field-label">Quantity:</div>
          <div class="label-field-val font-mono">${labelData.qty}</div>
        </div>
        ${showLot ? `
          <div>
            <div class="label-field-label">Batch / Lot #:</div>
            <div class="label-field-val font-mono">${labelData.lot}</div>
          </div>
        ` : ''}
      </div>

      <div class="label-qr-row">
        ${showQr ? `<div id="previewQrContainer" class="label-qr-canvas"></div>` : ''}
        <div class="label-footer-meta">
          <div><strong>Simpletory WMS</strong> &bull; Verified Pallet</div>
          <div>Printed: ${labelData.timestamp}</div>
          <div style="font-family:var(--font-mono); font-size:0.55rem;">UID: ${Math.random().toString(36).substring(2, 9).toUpperCase()}</div>
        </div>
      </div>
    `;

    // Render Barcode & QR Code
    if (showBarcode) {
      const barcodeEl = document.getElementById('previewBarcodeSvg');
      this.renderBarcode(barcodeEl, labelData.barcodeValue, tmpl.heightIn <= 2 ? 30 : 45);
    }
    if (showQr) {
      const qrEl = document.getElementById('previewQrContainer');
      this.renderQrCode(qrEl, labelData.qrValue, 64);
    }
  }

  executePrintLabels() {
    const printRoot = document.getElementById('printLabelContainer');
    const previewContent = document.getElementById('printLabelPreview');
    const copies = parseInt(document.getElementById('printCopiesCount')?.value || '1', 10);
    if (!printRoot || !previewContent) return;

    // Clone preview HTML into print pages
    printRoot.innerHTML = '';
    for (let i = 0; i < copies; i++) {
      const page = document.createElement('div');
      page.className = 'printable-label-page';
      page.innerHTML = previewContent.outerHTML;
      printRoot.appendChild(page);
    }

    this.showToast(`Dispatching ${copies} label(s) to thermal printer...`, 'info');
    setTimeout(() => {
      window.print();
    }, 150);
  }

  // ============================================================================
  // CSV BULK MASTER DATA IMPORTER & EXPORTER
  // ============================================================================
  openCsvImportModal(target = 'items') {
    const targetSel = document.getElementById('csvImportTarget');
    if (targetSel) targetSel.value = target;
    this.clearCsvFile();
    this.openModal('csvImportModal');
  }

  clearCsvFile() {
    const fileInp = document.getElementById('csvFileInput');
    if (fileInp) fileInp.value = '';
    this.parsedCsvData = null;
    document.getElementById('csvPreviewSection')?.classList.add('hidden');
    const importBtn = document.getElementById('btnExecuteCsvImport');
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.innerHTML = `<i data-lucide="check-circle-2"></i> Import 0 Records to Database`;
      this.initIcons();
    }
  }

  handleCsvFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      this.showToast('Please upload a valid .csv spreadsheet file', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = this.parseCsv(text);
      if (!parsed || parsed.rows.length === 0) {
        this.showToast('CSV file is empty or missing data rows', 'warning');
        return;
      }

      this.parsedCsvData = parsed;
      this.renderCsvPreview(file.name, parsed);
    };
    reader.readAsText(file);
  }

  parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return null;

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const parseRow = (rowStr) => {
      const regex = new RegExp(`(?:${delimiter}|\\r?\\n|^)(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}\\r\\n]*))`, 'gi');
      const matches = [];
      let match;
      while ((match = regex.exec(rowStr)) !== null) {
        if (match.index === regex.lastIndex) regex.lastIndex++;
        let val = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
        if (val !== undefined) matches.push(val.trim());
      }
      return matches;
    };

    const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseRow(lines[i]);
      if (values.length === 0) continue;
      const rowObj = {};
      headers.forEach((h, idx) => {
        rowObj[h] = values[idx] !== undefined ? values[idx] : '';
      });
      rows.push(rowObj);
    }
    return { headers, rows };
  }

  renderCsvPreview(fileName, parsed) {
    const previewSection = document.getElementById('csvPreviewSection');
    const thead = document.getElementById('csvPreviewThead');
    const tbody = document.getElementById('csvPreviewTbody');
    const validBadge = document.getElementById('csvValidRowsBadge');
    const totalBadge = document.getElementById('csvTotalRowsBadge');
    const fileNameDisplay = document.getElementById('csvFileNameDisplay');
    const importBtn = document.getElementById('btnExecuteCsvImport');
    if (!previewSection || !thead || !tbody) return;

    fileNameDisplay.textContent = fileName;
    validBadge.textContent = `${parsed.rows.length} Valid Records`;
    totalBadge.textContent = `${parsed.rows.length} Total`;

    // Render table headers
    thead.innerHTML = `<tr>${parsed.headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

    // Render first 5 sample rows
    tbody.innerHTML = parsed.rows.slice(0, 6).map(r => `
      <tr>${parsed.headers.map(h => `<td>${r[h] || '-'}</td>`).join('')}</tr>
    `).join('');

    previewSection.classList.remove('hidden');
    if (importBtn) {
      importBtn.disabled = false;
      importBtn.innerHTML = `<i data-lucide="check-circle-2"></i> Import ${parsed.rows.length} Records to Database`;
      this.initIcons();
    }
  }

  executeCsvImport() {
    if (!this.parsedCsvData || this.parsedCsvData.rows.length === 0) return;
    const target = document.getElementById('csvImportTarget')?.value || 'items';
    const rows = this.parsedCsvData.rows;
    const tenantId = store.state.activeTenantId;
    let importedCount = 0;

    if (target === 'items') {
      rows.forEach(r => {
        const sku = (r.sku || r.item_sku || r.item_code || `SKU-${Date.now().toString().slice(-4)}`).toUpperCase();
        const name = r.name || r.item_name || r.description || 'Imported SKU Product';
        const category = r.category || 'General Inventory';
        const baseUomId = r.base_uom || r.uom || 'uom-sqft';
        const costPrice = parseFloat(r.cost_price || r.cost || 0) || 0;
        const sellPrice = parseFloat(r.sell_price || r.price || 0) || 0;
        const reorderPt = parseFloat(r.reorder_point || r.reorder || 100) || 100;

        // Avoid duplicate SKU
        const existing = (store.state.items[tenantId] || []).find(i => i.sku === sku);
        if (existing) {
          existing.name = name;
          existing.category = category;
          existing.costPrice = costPrice;
          existing.sellPrice = sellPrice;
        } else {
          store.state.items[tenantId].push({
            id: `item-${sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            tenantId,
            sku,
            name,
            category,
            baseUomId,
            costPrice,
            sellPrice,
            reorderPoint: reorderPt,
            minSafetyStock: Math.floor(reorderPt / 2),
            barcode: r.barcode || sku,
            customFields: {}
          });
        }
        importedCount++;
      });
    } else if (target === 'lpns') {
      const activeFac = store.activeFacility?.id || store.tenantFacilities[0]?.id;
      const defaultLoc = store.tenantLocations[0]?.id || 'loc-a01-r01-a';

      rows.forEach(r => {
        const lpnNum = (r.lpn || r.lpn_number || r.pallet_id || `LPN-${Date.now().toString().slice(-6)}`).toUpperCase();
        const sku = (r.sku || r.item_sku || '').toUpperCase();
        const item = (store.state.items[tenantId] || []).find(i => i.sku === sku) || store.tenantItems[0];
        const qty = parseFloat(r.quantity || r.qty || 100) || 100;
        const lot = r.lot || r.lot_number || r.dye_lot || 'LOT-CSV-INIT';

        store.state.licensePlates[tenantId].push({
          id: `lpn-${lpnNum.toLowerCase()}`,
          tenantId,
          facilityId: activeFac,
          locationId: defaultLoc,
          lpnNumber: lpnNum,
          itemId: item ? item.id : (store.tenantItems[0]?.id || 'item-primary-01'),
          quantityBase: qty,
          palletStatus: 'available',
          customFields: { dye_lot_run: lot, batch_lot_tag: lot }
        });

        // Add audit transaction
        store.state.transactions[tenantId].unshift({
          id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tenantId,
          facilityId: activeFac,
          type: 'inbound_receipt',
          lpnId: lpnNum,
          sku: item ? item.sku : 'SKU-CSV',
          qtyChange: qty,
          uom: 'Units',
          fromLocationId: 'CSV Import',
          toLocationId: defaultLoc,
          referenceDoc: 'BULK-CSV-IMPORT',
          userName: store.currentUser?.name || 'Admin',
          timestamp: new Date().toISOString()
        });

        importedCount++;
      });
    }

    store.save();
    this.closeModal('csvImportModal');
    this.renderAll();
    this.showToast(`Successfully imported ${importedCount} records to ${target.toUpperCase()}!`, 'success');
  }

  downloadSampleCsv(target = 'items') {
    let csvContent = '';
    let fileName = '';

    if (target === 'items') {
      csvContent = 'sku,name,category,base_uom,cost_price,sell_price,reorder_point,barcode\n' +
        'SKU-PART-100,Industrial Flange Assembly,Mechanical,uom-ea,12.50,24.00,200,089128990100\n' +
        'SKU-COMP-200,Control Module Sensor 12V,Electronics,uom-ea,45.00,89.50,50,074128912200\n' +
        'SKU-PACK-300,Corrugated Shipping Carton Heavy Duty,Packaging,uom-cs,1.85,4.20,500,099124881300\n';
      fileName = 'simpletory_items_sample.csv';
    } else if (target === 'lpns') {
      csvContent = 'lpn_number,sku,quantity,lot_number,location_code\n' +
        'LPN-100001,SKU-PART-100,250,LOT-2026-X1,A01-R01-A\n' +
        'LPN-100002,SKU-COMP-200,80,LOT-2026-X2,A01-R02-B\n' +
        'LPN-100003,SKU-PACK-300,500,LOT-2026-X3,A02-R04-A\n';
      fileName = 'simpletory_opening_stock_sample.csv';
    } else {
      csvContent = 'code,name,zone,capacity,barcode\n' +
        'A03-R01-A,Aisle 3 Rack 1 Floor Bay,racking,4,LOC-A03-R01-A\n' +
        'A03-R01-B,Aisle 3 Rack 1 Level 2,racking,2,LOC-A03-R01-B\n';
      fileName = 'simpletory_locations_sample.csv';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast(`Downloaded sample template '${fileName}'`, 'success');
  }

  exportCsv(datasetType = 'items') {
    const tenantId = store.state.activeTenantId;
    let csvContent = '';
    let fileName = `simpletory_${datasetType}_${new Date().toISOString().split('T')[0]}.csv`;

    if (datasetType === 'items') {
      const items = store.tenantItems;
      const headers = ['sku', 'name', 'category', 'base_uom', 'cost_price', 'sell_price', 'reorder_point', 'barcode'];
      csvContent = headers.join(',') + '\n';
      items.forEach(i => {
        csvContent += `"${i.sku}","${i.name.replace(/"/g, '""')}","${i.category}","${i.baseUomId}",${i.costPrice || 0},${i.sellPrice || 0},${i.reorderPoint || 0},"${i.barcode || ''}"\n`;
      });
    } else if (datasetType === 'lpns') {
      const lpns = store.tenantLpns;
      const headers = ['lpn_number', 'sku', 'item_name', 'quantity', 'facility', 'location', 'lot_number', 'status'];
      csvContent = headers.join(',') + '\n';
      lpns.forEach(l => {
        const item = store.tenantItems.find(i => i.id === l.itemId);
        const loc = store.tenantLocations.find(loc => loc.id === l.locationId);
        const fac = store.tenantFacilities.find(f => f.id === l.facilityId);
        csvContent += `"${l.lpnNumber}","${item?.sku || ''}","${(item?.name || '').replace(/"/g, '""')}",${l.quantityBase},"${fac?.code || ''}","${loc?.code || ''}","${l.customFields?.dye_lot_run || l.customFields?.batch_lot_tag || ''}","${l.palletStatus}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast(`Exported ${datasetType.toUpperCase()} dataset to CSV`, 'success');
  }

  // ============================================================================
  // INTERACTIVE BARCODE SCANNER LOGIC
  // ============================================================================
  openScannerModal() {
    this.openModal('scannerModal');
    const chipsContainer = document.getElementById('sampleScanChips');
    const lpns = store.tenantLpns.slice(0, 3);
    const locs = store.tenantLocations.slice(0, 2);
    const items = store.tenantItems.slice(0, 2);

    const testCodes = [
      ...lpns.map(l => ({ code: l.lpnNumber, label: `LPN Pallet (${l.lpnNumber})` })),
      ...locs.map(loc => ({ code: loc.barcode, label: `Bin (${loc.code})` })),
      ...items.map(i => ({ code: i.barcode || i.sku, label: `SKU (${i.sku})` }))
    ];

    chipsContainer.innerHTML = testCodes.map(c => `
      <button class="sample-chip" onclick="app.processBarcodeScan('${c.code}')">${c.label}</button>
    `).join('');

    const resultCard = document.getElementById('scanResultCard');
    resultCard.classList.add('hidden');
    document.getElementById('manualScanInput').value = '';
  }

  processBarcodeScan(barcode) {
    const cleanCode = barcode.trim();
    const resultCard = document.getElementById('scanResultCard');
    const resultTitle = document.getElementById('scanResultTitle');
    const resultContent = document.getElementById('scanResultContent');
    const resultActions = document.getElementById('scanResultActions');

    // Play instant audio chime
    this.playScanBeep();

    // 1. Check if LPN
    const lpnMatch = store.tenantLpns.find(l => l.lpnNumber.toLowerCase() === cleanCode.toLowerCase());
    if (lpnMatch) {
      const item = store.tenantItems.find(i => i.id === lpnMatch.itemId);
      const loc = store.tenantLocations.find(l => l.id === lpnMatch.locationId);

      resultTitle.textContent = `Match Found: License Plate ${lpnMatch.lpnNumber}`;
      resultContent.innerHTML = `
        <div style="font-size:0.85rem; line-height:1.5;">
          <div><strong>Item:</strong> ${item ? item.name : 'Unknown'} (<span class="font-mono text-primary">${item ? item.sku : ''}</span>)</div>
          <div><strong>Bin Location:</strong> <span class="badge badge-primary">${loc ? loc.code : 'Unassigned'}</span></div>
          <div><strong>Stock:</strong> ${lpnMatch.quantityBase.toLocaleString()} ${item && item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Units'}</div>
        </div>
      `;
      resultActions.innerHTML = `
        <button class="btn btn-secondary btn-sm" onclick="app.closeModal('scannerModal'); app.triggerMoveModal('${lpnMatch.id}');">
          <i data-lucide="arrow-right-left"></i> Move LPN
        </button>
        <button class="btn btn-primary btn-sm" onclick="app.closeModal('scannerModal'); app.triggerAdjustModal('${lpnMatch.id}');">
          <i data-lucide="package-minus"></i> Pick Out
        </button>
        <button class="btn btn-outline btn-sm" onclick="app.closeModal('scannerModal'); app.openPrintLabelModal('lpn', '${lpnMatch.id}');">
          <i data-lucide="printer"></i> Print LPN Tag
        </button>
      `;
      resultCard.classList.remove('hidden');
      this.initIcons();
      return;
    }

    // 2. Check if Location Barcode
    const locMatch = store.tenantLocations.find(loc => loc.barcode.toLowerCase() === cleanCode.toLowerCase() || loc.code.toLowerCase() === cleanCode.toLowerCase());
    if (locMatch) {
      const binLpns = store.tenantLpns.filter(l => l.locationId === locMatch.id);
      resultTitle.textContent = `Match Found: Warehouse Bin ${locMatch.code}`;
      resultContent.innerHTML = `
        <div style="font-size:0.85rem; line-height:1.5;">
          <div><strong>Zone:</strong> ${locMatch.zone} &bull; <strong>Capacity:</strong> ${binLpns.length} / ${locMatch.capacity} Pallets</div>
          <div><strong>Current Pallets:</strong> ${binLpns.map(l => `<span class="badge badge-subtle font-mono">${l.lpnNumber}</span>`).join(' ') || 'Empty Bin'}</div>
        </div>
      `;
      resultActions.innerHTML = `
        <button class="btn btn-primary btn-sm" onclick="app.closeModal('scannerModal'); app.navigateTo('facilities');">
          <i data-lucide="eye"></i> View Bin in Warehouse
        </button>
        <button class="btn btn-outline btn-sm" onclick="app.closeModal('scannerModal'); app.openPrintLabelModal('location', '${locMatch.id}');">
          <i data-lucide="printer"></i> Print Bin Marker
        </button>
      `;
      resultCard.classList.remove('hidden');
      this.initIcons();
      return;
    }

    // 3. Check if Item SKU
    const itemMatch = store.tenantItems.find(i => i.sku.toLowerCase() === cleanCode.toLowerCase() || (i.barcode && i.barcode.toLowerCase() === cleanCode.toLowerCase()));
    if (itemMatch) {
      const itemLpns = store.tenantLpns.filter(l => l.itemId === itemMatch.id);
      const totalUnits = itemLpns.reduce((sum, l) => sum + l.quantityBase, 0);

      resultTitle.textContent = `Match Found: Master Item ${itemMatch.sku}`;
      resultContent.innerHTML = `
        <div style="font-size:0.85rem; line-height:1.5;">
          <div><strong>Product:</strong> ${itemMatch.name}</div>
          <div><strong>Total On Hand:</strong> ${totalUnits.toLocaleString()} ${itemMatch.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'} (${itemLpns.length} Pallets)</div>
        </div>
      `;
      resultActions.innerHTML = `
        <button class="btn btn-primary btn-sm" onclick="app.closeModal('scannerModal'); app.triggerReceiveForItem('${itemMatch.id}');">
          <i data-lucide="download"></i> Receive Inbound
        </button>
        <button class="btn btn-outline btn-sm" onclick="app.closeModal('scannerModal'); app.triggerAdjustModal(null, '${itemMatch.id}');">
          <i data-lucide="package-minus"></i> Pick Out
        </button>
        <button class="btn btn-secondary btn-sm" onclick="app.closeModal('scannerModal'); app.openPrintLabelModal('sku', '${itemMatch.id}');">
          <i data-lucide="printer"></i> Print SKU Sticker
        </button>
      `;
      resultCard.classList.remove('hidden');
      this.initIcons();
      return;
    }

    // No match
    resultTitle.textContent = `No Record Found for '${cleanCode}'`;
    resultContent.innerHTML = `<p class="text-muted" style="font-size:0.8rem;">Barcode does not match any active LPN, Location tag, or SKU in this organization.</p>`;
    resultActions.innerHTML = ``;
    resultCard.classList.remove('hidden');
  }

  printBarcodeTag(tag) {
    this.openPrintLabelModal('lpn');
  }

  // ============================================================================
  // TOAST NOTIFICATIONS
  // ============================================================================
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let iconName = 'info';
    if (type === 'success') iconName = 'check-circle-2';
    if (type === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
      <i data-lucide="${iconName}" style="width:18px;height:18px;flex-shrink:0;"></i>
      <span>${message}</span>
    `;

    this.toastContainer.appendChild(toast);
    this.initIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
}

// Instantiate Global App on DOM Ready
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new SimpletoryApp();
  window.app = app;
});
