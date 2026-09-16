/**
 * SIMPLETORY WMS v3.0 - MAIN APPLICATION LOGIC
 * Dynamic Reactive Multi-Tenant WMS Engine with UOM Hierarchy & Custom Field (UDF) Engine
 * Facility-Level & Dashboard-Level LPN vs Summary Mode Gating
 * Complete Inbound Receipt, LPN Relocation & Outbound Stock Adjustment / Job Dispatch
 */

// ============================================================================
// INITIAL MOCK DATABASE & DEFAULT SEED DATA
// ============================================================================
const DEFAULT_STORAGE_KEY = 'simpletory_wms_db_v3';

const INITIAL_DB = {
  activeTenantId: 'tenant-flooring',
  activeFacilityId: 'fac-main-dc',
  inventoryMode: 'lpn', // 'lpn' or 'summary'
  theme: 'dark',

  // Tenants List
  tenants: [
    {
      id: 'tenant-flooring',
      name: 'Apex Flooring & Tile Solutions',
      slug: 'apex-flooring',
      template: 'flooring',
      tier: 'Free Tier Active (0$ / mo)',
      createdAt: '2026-08-10',
      adminUser: { name: 'Derek Lumpkin', email: 'derek@apexflooring.com', role: 'Company Admin' }
    },
    {
      id: 'tenant-general',
      name: 'Cascade Distribution & Logistics',
      slug: 'cascade-logistics',
      template: 'general_wms',
      tier: 'Free Tier Active (0$ / mo)',
      createdAt: '2026-08-28',
      adminUser: { name: 'Elena Rostova', email: 'elena@cascadelogistics.com', role: 'Company Admin' }
    }
  ],

  // Tenant-Level Units of Measure (UOM)
  unitsOfMeasure: {
    'tenant-flooring': [
      { id: 'uom-sqft', name: 'Square Feet', code: 'SQFT', category: 'area', isBaseDefault: true },
      { id: 'uom-box', name: 'Carton / Box', code: 'BOX', category: 'count', isBaseDefault: false },
      { id: 'uom-pallet', name: 'Pallet (Outer Pack)', code: 'PLT', category: 'count', isBaseDefault: false },
      { id: 'uom-roll', name: 'Carpet Roll', code: 'RL', category: 'length', isBaseDefault: false },
      { id: 'uom-linft', name: 'Linear Feet', code: 'LFT', category: 'length', isBaseDefault: false },
      { id: 'uom-pc', name: 'Piece / Tile', code: 'PC', category: 'count', isBaseDefault: false }
    ],
    'tenant-general': [
      { id: 'uom-ea', name: 'Each / Unit', code: 'EA', category: 'count', isBaseDefault: true },
      { id: 'uom-cs', name: 'Case', code: 'CS', category: 'count', isBaseDefault: false },
      { id: 'uom-plt', name: 'Pallet', code: 'PLT', category: 'count', isBaseDefault: false },
      { id: 'uom-lbs', name: 'Pounds (Lbs)', code: 'LBS', category: 'weight', isBaseDefault: false }
    ]
  },

  // Tenant-Level User-Defined Custom Fields (UDFs)
  customFields: {
    'tenant-flooring': [
      { id: 'udf-sqft-box', key: 'sqft_per_box', label: 'Sq Ft per Box', type: 'number', required: true, showInGrid: true, entity: 'item' },
      { id: 'udf-color-stain', key: 'color_stain', label: 'Color / Stain', type: 'text', required: true, showInGrid: true, entity: 'item' },
      { id: 'udf-dye-lot', key: 'dye_lot_run', label: 'Dye Lot / Run #', type: 'text', required: true, showInGrid: true, entity: 'lpn' },
      { id: 'udf-wear-layer', key: 'wear_layer_mil', label: 'Wear Layer (mil)', type: 'text', required: false, showInGrid: false, entity: 'item' }
    ],
    'tenant-general': [
      { id: 'udf-oem-num', key: 'oem_part_no', label: 'OEM Part Number', type: 'text', required: true, showInGrid: true, entity: 'item' },
      { id: 'udf-weight', key: 'weight_per_unit', label: 'Weight per Unit (lbs)', type: 'number', required: false, showInGrid: true, entity: 'item' },
      { id: 'udf-batch-id', key: 'batch_lot_tag', label: 'Batch / Lot Tag', type: 'text', required: true, showInGrid: true, entity: 'lpn' }
    ]
  },

  // Facilities with trackingMode: 'lpn' vs 'summary_only'
  facilities: {
    'tenant-flooring': [
      { id: 'fac-main-dc', code: 'FAC-01', name: 'Main Distribution Center & Warehouse', type: 'warehouse', address: '1040 Logistics Pkwy, Bldg 4', trackingMode: 'lpn' },
      { id: 'fac-showroom', code: 'FAC-02', name: 'Downtown Design Showroom & Samples', type: 'showroom', address: '420 Metro Blvd, Suite 100', trackingMode: 'summary_only' },
      { id: 'fac-van-3', code: 'FAC-03', name: 'Mobile Installation Van #3', type: 'mobile_van', address: 'Fleet Field Vehicle', trackingMode: 'summary_only' }
    ],
    'tenant-general': [
      { id: 'fac-gen-hub', code: 'FAC-01', name: 'Cascades Central Distribution', type: 'warehouse', address: '88 Commerce Way', trackingMode: 'lpn' },
      { id: 'fac-gen-dock', code: 'FAC-02', name: 'Cross-Dock Terminal East', type: 'warehouse', address: '12 Freight Lane', trackingMode: 'lpn' }
    ]
  },

  // Locations / Bins per Facility
  locations: {
    'tenant-flooring': [
      { id: 'loc-a01-r01-a', facilityId: 'fac-main-dc', code: 'A01-R01-A', name: 'Aisle 1, Rack 1, Floor Bay', zone: 'racking', capacity: 4, barcode: 'LOC-A01-R01-A' },
      { id: 'loc-a01-r02-b', facilityId: 'fac-main-dc', code: 'A01-R02-B', name: 'Aisle 1, Rack 2, Level 2', zone: 'racking', capacity: 2, barcode: 'LOC-A01-R02-B' },
      { id: 'loc-a02-r04-a', facilityId: 'fac-main-dc', code: 'A02-R04-A', name: 'Aisle 2, Rack 4, Heavy Pallet Bay', zone: 'racking', capacity: 3, barcode: 'LOC-A02-R04-A' },
      { id: 'loc-car-01', facilityId: 'fac-main-dc', code: 'ROLL-CAR-01', name: 'Carpet Roll Carousel Tower A', zone: 'roll_rack', capacity: 12, barcode: 'LOC-ROLL-01' },
      { id: 'loc-rcv-01', facilityId: 'fac-main-dc', code: 'RCV-DOCK-1', name: 'Inbound Receiving Staging Dock', zone: 'receiving', capacity: 10, barcode: 'LOC-RCV-01' },
      { id: 'loc-shw-rack', facilityId: 'fac-showroom', code: 'SHW-RACK-1', name: 'Showroom Sample Display Rack', zone: 'floor_bulk', capacity: 50, barcode: 'LOC-SHW-01' },
      { id: 'loc-van-bin', facilityId: 'fac-van-3', code: 'VAN-BIN-1', name: 'Van Interior Tool & Box Shelf', zone: 'floor_bulk', capacity: 20, barcode: 'LOC-VAN-01' }
    ],
    'tenant-general': [
      { id: 'loc-g-01', facilityId: 'fac-gen-hub', code: 'BAY-01-A', name: 'Main High-Bay Rack 1', zone: 'racking', capacity: 6, barcode: 'LOC-BAY-01-A' },
      { id: 'loc-g-02', facilityId: 'fac-gen-hub', code: 'BAY-02-B', name: 'Main High-Bay Rack 2', zone: 'racking', capacity: 6, barcode: 'LOC-BAY-02-B' }
    ]
  },

  // Manufacturers & Suppliers
  manufacturers: {
    'tenant-flooring': [
      { id: 'mfr-shaw', name: 'Shaw Floors', repName: 'Sarah Jenkins', repPhone: '(800) 555-0192', repEmail: 'sarah.j@shawfloors.com', leadTimeDays: 4, brandLines: ['Anderson Tuftex', 'Coretec LVP', 'Philadelphia Commercial'] },
      { id: 'mfr-mohawk', name: 'Mohawk Industries', repName: 'Dave Miller', repPhone: '(800) 555-0844', repEmail: 'orders@mohawkflooring.com', leadTimeDays: 6, brandLines: ['RevWood Laminate', 'SolidTech Plus', 'Karastan Carpets'] },
      { id: 'mfr-mannington', name: 'Mannington Commercial', repName: 'Rachel Adams', repPhone: '(856) 555-9311', repEmail: 'radams@mannington.com', leadTimeDays: 5, brandLines: ['Adura Max LVP', 'Mannington Hardwood'] },
      { id: 'mfr-daltile', name: 'Daltile Ceramic & Stone', repName: 'Carlos Vega', repPhone: '(214) 555-7720', repEmail: 'cvega@daltile.com', leadTimeDays: 3, brandLines: ['Porcelain Tile', 'Natural Slate', 'Mosaic Accents'] }
    ],
    'tenant-general': [
      { id: 'mfr-gen-1', name: 'Industrial Parts Direct', repName: 'Tom Hanks', repPhone: '(555) 123-4567', repEmail: 'tom@ipd.com', leadTimeDays: 2, brandLines: ['Fasteners', 'Bearings'] }
    ]
  },

  // Master Item Catalog
  items: {
    'tenant-flooring': [
      {
        id: 'item-oak-01',
        sku: 'SKU-OAK-01',
        name: 'Rustic White Oak 7.5in Wirebrushed Plank',
        category: 'Hardwood',
        manufacturerId: 'mfr-shaw',
        baseUomId: 'uom-sqft',
        packaging: { caseMultiplier: 30, palletMultiplier: 60 },
        costPrice: 3.45,
        sellingPrice: 5.95,
        reorderPoint: 200,
        barcode: 'SKU-OAK-01',
        customFields: { sqft_per_box: 30.0, color_stain: 'Coastal Dune White', wear_layer_mil: '4mm Sawn Face' }
      },
      {
        id: 'item-lvp-04',
        sku: 'SKU-LVP-04',
        name: 'Cascade Rigid Core SPC Waterproof Plank',
        category: 'LVP (Luxury Vinyl Plank)',
        manufacturerId: 'mfr-mannington',
        baseUomId: 'uom-sqft',
        packaging: { caseMultiplier: 24.5, palletMultiplier: 48 },
        costPrice: 1.85,
        sellingPrice: 3.49,
        reorderPoint: 350,
        barcode: 'SKU-LVP-04',
        customFields: { sqft_per_box: 24.5, color_stain: 'Smoky Espresso', wear_layer_mil: '20 mil Commercial' }
      },
      {
        id: 'item-tile-09',
        sku: 'SKU-TILE-09',
        name: 'Marmi Carrara 24x48 Polished Porcelain Tile',
        category: 'Tile & Stone',
        manufacturerId: 'mfr-daltile',
        baseUomId: 'uom-sqft',
        packaging: { caseMultiplier: 16.0, palletMultiplier: 32 },
        costPrice: 2.90,
        sellingPrice: 5.20,
        reorderPoint: 150,
        barcode: 'SKU-TILE-09',
        customFields: { sqft_per_box: 16.0, color_stain: 'Carrara White Polished', wear_layer_mil: 'N/A Porcelain' }
      },
      {
        id: 'item-crpt-02',
        sku: 'SKU-CRPT-02',
        name: 'Sierra Soft Texture 12ft Plush Broadloom',
        category: 'Carpet & Rugs',
        manufacturerId: 'mfr-mohawk',
        baseUomId: 'uom-sqft',
        packaging: { caseMultiplier: 1, palletMultiplier: 1 },
        costPrice: 1.65,
        sellingPrice: 2.99,
        reorderPoint: 400,
        barcode: 'SKU-CRPT-02',
        customFields: { sqft_per_box: 1.0, color_stain: 'Oatmeal Heather', wear_layer_mil: 'SmartStrand Silk' }
      }
    ],
    'tenant-general': [
      {
        id: 'item-gen-01',
        sku: 'SKU-VALVE-01',
        name: 'High Pressure Brass Ball Valve 1-inch',
        category: 'Hardware',
        manufacturerId: 'mfr-gen-1',
        baseUomId: 'uom-ea',
        packaging: { caseMultiplier: 25, palletMultiplier: 40 },
        costPrice: 8.50,
        sellingPrice: 14.00,
        reorderPoint: 100,
        barcode: 'SKU-VALVE-01',
        customFields: { oem_part_no: 'BV-9842-BR', weight_per_unit: 1.4 }
      }
    ]
  },

  // Relational Item Units of Measure Subtable (`item_uoms`)
  itemUoms: {
    'tenant-flooring': [
      // SKU-OAK-01: Rustic White Oak Plank
      {
        id: 'iuom-oak-1',
        itemId: 'item-oak-01',
        uomId: 'uom-sqft',
        tierLevel: 1,
        tierName: 'Base Unit (Sq Ft)',
        multiplier: 1,
        barcode: 'SKU-OAK-01-SQFT',
        isBase: true,
        description: 'Individual 1 Sq Ft surface area'
      },
      {
        id: 'iuom-oak-2',
        itemId: 'item-oak-01',
        uomId: 'uom-box',
        tierLevel: 2,
        tierName: 'Carton / Box',
        multiplier: 30,
        barcode: '0712345001012',
        isBase: false,
        description: '30 Sq Ft per Box (10 planks)'
      },
      {
        id: 'iuom-oak-3',
        itemId: 'item-oak-01',
        uomId: 'uom-pallet',
        tierLevel: 3,
        tierName: 'Master Pallet',
        multiplier: 1800,
        barcode: '00107123450010129',
        isBase: false,
        description: '60 Boxes / Pallet (1,800 Sq Ft)'
      },

      // SKU-LVP-04: Cascade Rigid Core SPC Waterproof Plank
      {
        id: 'iuom-lvp-1',
        itemId: 'item-lvp-04',
        uomId: 'uom-sqft',
        tierLevel: 1,
        tierName: 'Base Unit (Sq Ft)',
        multiplier: 1,
        barcode: 'SKU-LVP-04-SQFT',
        isBase: true,
        description: 'Individual 1 Sq Ft surface area'
      },
      {
        id: 'iuom-lvp-2',
        itemId: 'item-lvp-04',
        uomId: 'uom-box',
        tierLevel: 2,
        tierName: 'Carton / Box',
        multiplier: 24.5,
        barcode: '0712345002040',
        isBase: false,
        description: '24.5 Sq Ft per Box (8 planks)'
      },
      {
        id: 'iuom-lvp-3',
        itemId: 'item-lvp-04',
        uomId: 'uom-pallet',
        tierLevel: 3,
        tierName: 'Master Pallet',
        multiplier: 1176,
        barcode: '00107123450020405',
        isBase: false,
        description: '48 Boxes / Pallet (1,176 Sq Ft)'
      },

      // SKU-TILE-09: Marmi Carrara Polished Porcelain Tile
      {
        id: 'iuom-tile-1',
        itemId: 'item-tile-09',
        uomId: 'uom-sqft',
        tierLevel: 1,
        tierName: 'Base Unit (Sq Ft)',
        multiplier: 1,
        barcode: 'SKU-TILE-09-SQFT',
        isBase: true,
        description: 'Individual 1 Sq Ft surface area'
      },
      {
        id: 'iuom-tile-2',
        itemId: 'item-tile-09',
        uomId: 'uom-box',
        tierLevel: 2,
        tierName: 'Carton / Crate',
        multiplier: 16,
        barcode: '0712345003091',
        isBase: false,
        description: '16 Sq Ft per Crate (8 tiles)'
      },
      {
        id: 'iuom-tile-3',
        itemId: 'item-tile-09',
        uomId: 'uom-pallet',
        tierLevel: 3,
        tierName: 'Master Pallet',
        multiplier: 512,
        barcode: '00107123450030918',
        isBase: false,
        description: '32 Crates / Pallet (512 Sq Ft)'
      },

      // SKU-CRPT-02: Sierra Soft Texture Broadloom Carpet
      {
        id: 'iuom-crpt-1',
        itemId: 'item-crpt-02',
        uomId: 'uom-sqft',
        tierLevel: 1,
        tierName: 'Base Unit (Sq Ft)',
        multiplier: 1,
        barcode: 'SKU-CRPT-02-SQFT',
        isBase: true,
        description: 'Individual 1 Sq Ft surface area'
      },
      {
        id: 'iuom-crpt-2',
        itemId: 'item-crpt-02',
        uomId: 'uom-linft',
        tierLevel: 2,
        tierName: 'Linear Foot (12ft Roll Width)',
        multiplier: 12,
        barcode: 'SKU-CRPT-02-LFT',
        isBase: false,
        description: '1 Linear Foot cut from 12ft width (12 Sq Ft)'
      },
      {
        id: 'iuom-crpt-3',
        itemId: 'item-crpt-02',
        uomId: 'uom-roll',
        tierLevel: 3,
        tierName: 'Full Master Roll (50 LFT)',
        multiplier: 600,
        barcode: 'SKU-CRPT-02-ROLL',
        isBase: false,
        description: '1 Full Roll (12ft × 50ft = 600 Sq Ft)'
      }
    ],
    'tenant-general': [
      // SKU-VALVE-01
      {
        id: 'iuom-gen-1',
        itemId: 'item-gen-01',
        uomId: 'uom-ea',
        tierLevel: 1,
        tierName: 'Each (Indivisible Unit)',
        multiplier: 1,
        barcode: 'SKU-VALVE-01-EA',
        isBase: true,
        description: 'Single brass valve unit'
      },
      {
        id: 'iuom-gen-2',
        itemId: 'item-gen-01',
        uomId: 'uom-cs',
        tierLevel: 2,
        tierName: 'Carton Case',
        multiplier: 25,
        barcode: '0712345009911',
        isBase: false,
        description: '25 valves per case'
      },
      {
        id: 'iuom-gen-3',
        itemId: 'item-gen-01',
        uomId: 'uom-plt',
        tierLevel: 3,
        tierName: 'Master Skid / Pallet',
        multiplier: 1000,
        barcode: '00107123450099117',
        isBase: false,
        description: '40 cases / Pallet (1,000 valves)'
      }
    ]
  },

  // License Plates (LPN Mode Inventory)
  licensePlates: {
    'tenant-flooring': [
      {
        id: 'lpn-1001',
        lpnNumber: 'LPN-849201',
        itemId: 'item-oak-01',
        facilityId: 'fac-main-dc',
        locationId: 'loc-a01-r01-a',
        quantityBase: 1800,
        status: 'available',
        receivedAt: '2026-09-10T09:30:00Z',
        customFields: { dye_lot_run: 'RUN-2026-08B', roll_id: 'N/A Pallet' }
      },
      {
        id: 'lpn-1002',
        lpnNumber: 'LPN-849202',
        itemId: 'item-oak-01',
        facilityId: 'fac-main-dc',
        locationId: 'loc-a01-r02-b',
        quantityBase: 900,
        status: 'available',
        receivedAt: '2026-09-11T14:15:00Z',
        customFields: { dye_lot_run: 'RUN-2026-08B', roll_id: 'N/A Pallet' }
      },
      {
        id: 'lpn-1003',
        lpnNumber: 'LPN-849203',
        itemId: 'item-lvp-04',
        facilityId: 'fac-main-dc',
        locationId: 'loc-a02-r04-a',
        quantityBase: 1176,
        status: 'reserved',
        receivedAt: '2026-09-12T11:00:00Z',
        customFields: { dye_lot_run: 'LOT-9921-C', roll_id: 'Job #4092 Staged' }
      },
      {
        id: 'lpn-1004',
        lpnNumber: 'LPN-849204',
        itemId: 'item-tile-09',
        facilityId: 'fac-main-dc',
        locationId: 'loc-rcv-01',
        quantityBase: 512,
        status: 'available',
        receivedAt: '2026-09-14T08:20:00Z',
        customFields: { dye_lot_run: 'SHADE-V4-MARMI', roll_id: 'Pallet Tag 4' }
      },
      {
        id: 'lpn-1005',
        lpnNumber: 'LPN-849205',
        itemId: 'item-crpt-02',
        facilityId: 'fac-main-dc',
        locationId: 'loc-car-01',
        quantityBase: 600,
        status: 'available',
        receivedAt: '2026-09-08T16:45:00Z',
        customFields: { dye_lot_run: 'DYE-774-MOH', roll_id: 'ROLL-MOH-941' }
      }
    ],
    'tenant-general': [
      {
        id: 'lpn-g-1',
        lpnNumber: 'LPN-309112',
        itemId: 'item-gen-01',
        facilityId: 'fac-gen-hub',
        locationId: 'loc-g-01',
        quantityBase: 1000,
        status: 'available',
        receivedAt: '2026-09-01T10:00:00Z',
        customFields: { batch_lot_tag: 'BATCH-2026-Q3' }
      }
    ]
  },

  // Stock Movement Audit Log
  transactions: {
    'tenant-flooring': [
      { id: 'tx-101', timestamp: '2026-09-15 08:30', type: 'Receive Inbound', lpn: 'LPN-849204', sku: 'SKU-TILE-09', from: 'Vendor Dock', to: 'FAC-01 / RCV-DOCK-1', qty: '+512 Sq Ft (32 Bxs / 1 Plt)', user: 'Derek L.', note: 'PO-8842 Shaw' },
      { id: 'tx-102', timestamp: '2026-09-15 11:15', type: 'Move LPN', lpn: 'LPN-849201', sku: 'SKU-OAK-01', from: 'FAC-01 / RCV-DOCK-1', to: 'FAC-01 / A01-R01-A', qty: '1,800 Sq Ft (60 Bxs / 1 Plt)', user: 'Marcus V.', note: 'Forklift Putaway' },
      { id: 'tx-103', timestamp: '2026-09-15 14:20', type: 'Job Reserve', lpn: 'LPN-849203', sku: 'SKU-LVP-04', from: 'FAC-01 / A02-R04-A', to: 'FAC-01 / Staging', qty: '1,176 Sq Ft (48 Bxs / 1 Plt)', user: 'Derek L.', note: 'Reserved for Job #4092' }
    ],
    'tenant-general': [
      { id: 'tx-g-1', timestamp: '2026-09-01 10:00', type: 'Receive Inbound', lpn: 'LPN-309112', sku: 'SKU-VALVE-01', from: 'Vendor Dock', to: 'FAC-01 / BAY-01-A', qty: '+1,000 Units (40 Cases / 1 Plt)', user: 'Elena R.', note: 'Initial Inbound' }
    ]
  },

  // Users & Staff
  users: {
    'tenant-flooring': [
      { id: 'usr-1', name: 'Derek Lumpkin', email: 'derek@apexflooring.com', role: 'Company Admin', facilities: 'All Facilities', status: 'Active' },
      { id: 'usr-2', name: 'Marcus Vance', email: 'marcus@apexflooring.com', role: 'Warehouse Lead', facilities: 'FAC-01 Main DC', status: 'Active' },
      { id: 'usr-3', name: 'Carlos Gutierrez', email: 'carlos@apexflooring.com', role: 'Field Installer', facilities: 'FAC-03 Mobile Van #3', status: 'Active' },
      { id: 'usr-4', name: 'Jessica Taylor', email: 'jessica@apexflooring.com', role: 'Showroom Sales', facilities: 'FAC-02 Showroom', status: 'Active' }
    ],
    'tenant-general': [
      { id: 'usr-g-1', name: 'Elena Rostova', email: 'elena@cascadelogistics.com', role: 'Company Admin', facilities: 'All Facilities', status: 'Active' }
    ]
  }
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
      const saved = localStorage.getItem(DEFAULT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.itemUoms || Object.keys(parsed.itemUoms).length === 0) {
          parsed.itemUoms = JSON.parse(JSON.stringify(INITIAL_DB.itemUoms));
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Could not read from localStorage, using initial seed data.', e);
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
    return this.state.tenants.find(t => t.id === this.state.activeTenantId) || this.state.tenants[0];
  }

  get tenantUoms() {
    return this.state.unitsOfMeasure[this.state.activeTenantId] || [];
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
    this.renderAll();
    this.initIcons();
    this.initCloudSync();
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
    this.activeDetailItemId = 'item-oak-01';

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
      const remoteData = await window.supabaseService.fetchTenantData(store.state.activeTenantId);
      if (remoteData && (remoteData.facilities.length > 0 || remoteData.items.length > 0)) {
        if (remoteData.facilities.length > 0) store.state.facilities[store.state.activeTenantId] = remoteData.facilities;
        if (remoteData.locations.length > 0) store.state.locations[store.state.activeTenantId] = remoteData.locations;
        if (remoteData.items.length > 0) store.state.items[store.state.activeTenantId] = remoteData.items;
        if (remoteData.licensePlates.length > 0) store.state.licensePlates[store.state.activeTenantId] = remoteData.licensePlates;
        if (remoteData.unitsOfMeasure.length > 0) store.state.unitsOfMeasure[store.state.activeTenantId] = remoteData.unitsOfMeasure;
        if (remoteData.customFields.length > 0) store.state.customFields[store.state.activeTenantId] = remoteData.customFields;
        if (remoteData.transactions.length > 0) store.state.transactions[store.state.activeTenantId] = remoteData.transactions;
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
      store.state.activeTenantId = e.target.value;
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
    this.headerModeLpnBtn.addEventListener('click', () => setInventoryMode('lpn'));
    this.headerModeSummaryBtn.addEventListener('click', () => setInventoryMode('summary'));

    // Dashboard Mode Buttons
    this.dashModeLpnBtn?.addEventListener('click', () => setInventoryMode('lpn'));
    this.dashModeSummaryBtn?.addEventListener('click', () => setInventoryMode('summary'));

    // Inventory View Mode Buttons
    this.viewToggleLpn.addEventListener('click', () => setInventoryMode('lpn'));
    this.viewToggleSummary.addEventListener('click', () => setInventoryMode('summary'));

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
      this.triggerAdjustModal(null, this.activeDetailItemId);
    });

    // Quick Action Bar in Dashboard
    document.getElementById('stripReceiveBtn')?.addEventListener('click', () => this.openModal('receiveStockModal'));
    document.getElementById('stripMoveBtn')?.addEventListener('click', () => this.openModal('moveLpnModal'));
    document.getElementById('stripPickBtn')?.addEventListener('click', () => this.triggerAdjustModal());
    document.getElementById('stripItemCatalogBtn')?.addEventListener('click', () => this.navigateTo('items'));
    document.getElementById('stripCustomFieldsBtn')?.addEventListener('click', () => this.navigateTo('tenant-settings'));

    document.getElementById('btnQuickReceiveFromDash')?.addEventListener('click', () => this.openModal('receiveStockModal'));
    document.getElementById('btnQuickMoveFromDash')?.addEventListener('click', () => this.openModal('moveLpnModal'));
    document.getElementById('btnReceiveInbound')?.addEventListener('click', () => this.openModal('receiveStockModal'));
    document.getElementById('btnAddNewItem')?.addEventListener('click', () => this.openModal('addItemModal'));
    document.getElementById('btnAddFacilityModalBtn')?.addEventListener('click', () => this.openModal('addFacilityModal'));
    document.getElementById('btnAddFacilityQuick')?.addEventListener('click', () => this.openModal('addFacilityModal'));
    document.getElementById('btnAddLocationModalBtn')?.addEventListener('click', () => this.openModal('addLocationModal'));
    document.getElementById('btnAddManufacturerModalBtn')?.addEventListener('click', () => this.openModal('addManufacturerModal'));
    document.getElementById('btnCreateNewTenantModal')?.addEventListener('click', () => this.openModal('createTenantModal'));
    document.getElementById('btnInviteUserModal')?.addEventListener('click', () => this.showToast('User invitation email dispatched (Free tier SMTP)', 'success'));
    document.getElementById('btnEditCustomFieldsLink')?.addEventListener('click', () => this.navigateTo('tenant-settings'));
    document.getElementById('btnViewAllMovements')?.addEventListener('click', () => this.navigateTo('operations'));

    // Barcode Scanner Buttons
    this.quickScanBtn.addEventListener('click', () => this.openScannerModal());
    if (this.mobileScanFab) {
      this.mobileScanFab.addEventListener('click', () => this.openScannerModal());
    }

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

    // 3. Adjust Stock Out / Job Dispatch Form
    const adjForm = document.getElementById('adjustStockForm');
    if (adjForm) {
      const updateAdjComputation = () => {
        const isLpnMode = this.isCurrentFacilityLpnEnabled();
        const lpnSel = document.getElementById('adjLpnSelect');
        const itemSel = document.getElementById('adjItemSelect');
        const qtyInput = document.getElementById('adjQuantityInput');
        const uomSel = document.getElementById('adjUomSelect');
        const compText = document.getElementById('adjComputationText');
        const consumeAll = document.getElementById('adjConsumeAllCheckbox');

        let item, availableBase = 0;

        if (isLpnMode) {
          const lpn = store.tenantLpns.find(l => l.id === lpnSel.value);
          if (lpn) {
            item = store.tenantItems.find(i => i.id === lpn.itemId);
            availableBase = lpn.quantityBase;
          }
        } else {
          item = store.tenantItems.find(i => i.id === itemSel.value);
          if (item) {
            const activeFacId = store.state.activeFacilityId;
            const facLpns = store.tenantLpns.filter(l => l.itemId === item.id && (activeFacId === 'all' || l.facilityId === activeFacId));
            availableBase = facLpns.reduce((s, l) => s + l.quantityBase, 0);
          }
        }

        if (!item) return;

        const uomType = uomSel.value;
        const uomName = item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea';

        if (consumeAll.checked) {
          const convAvail = UomEngine.convert(item, availableBase, 'base');
          if (uomType === 'pallet') {
            qtyInput.value = convAvail.fullPallets;
          } else if (uomType === 'case') {
            qtyInput.value = convAvail.fullCases;
          } else {
            qtyInput.value = availableBase;
          }
        }

        const deductQty = parseFloat(qtyInput.value) || 0;
        const deductConv = UomEngine.convert(item, deductQty, uomType);
        const remainingBase = availableBase - deductConv.baseUnits;

        if (remainingBase < 0) {
          compText.innerHTML = `<span style="color:var(--accent-rose); font-weight:700;">⚠️ Error: Requested deduction (${deductConv.baseUnits.toLocaleString()} ${uomName}) exceeds available stock (${availableBase.toLocaleString()} ${uomName})</span>`;
          document.getElementById('btnSubmitAdjustStock').disabled = true;
        } else {
          document.getElementById('btnSubmitAdjustStock').disabled = false;
          compText.innerHTML = `Deducting: <strong>${deductConv.baseUnits.toLocaleString()} ${uomName}</strong> (${deductConv.fullCases} Cases) &bull; Remaining Balance: <strong>${remainingBase.toLocaleString()} ${uomName}</strong> (${Math.floor(remainingBase / (item.packaging?.caseMultiplier || 1))} Cases)`;
        }
      };

      document.getElementById('adjLpnSelect')?.addEventListener('change', () => {
        this.populateAdjUoms();
        this.updateAdjPreviewCard();
        updateAdjComputation();
      });
      document.getElementById('adjItemSelect')?.addEventListener('change', () => {
        this.populateAdjUoms();
        this.updateAdjPreviewCard();
        updateAdjComputation();
      });
      document.getElementById('adjQuantityInput')?.addEventListener('input', updateAdjComputation);
      document.getElementById('adjUomSelect')?.addEventListener('change', updateAdjComputation);
      document.getElementById('adjConsumeAllCheckbox')?.addEventListener('change', updateAdjComputation);

      adjForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const isLpnMode = this.isCurrentFacilityLpnEnabled();
        const lpnId = document.getElementById('adjLpnSelect').value;
        const itemId = document.getElementById('adjItemSelect').value;
        const reasonCode = document.getElementById('adjReasonCodeSelect').value;
        const reference = document.getElementById('adjReferenceInput').value.trim();
        const destination = document.getElementById('adjDestinationInput').value.trim();
        const deductQty = parseFloat(document.getElementById('adjQuantityInput').value);
        const deductUom = document.getElementById('adjUomSelect').value;

        const reasonLabels = {
          job_dispatch: 'Job Dispatch',
          damage_scrap: 'Scrap / Damage',
          cycle_count_loss: 'Cycle Count Shrinkage',
          sample_pull: 'Showroom Sample',
          rtv: 'Return to Vendor'
        };

        if (isLpnMode) {
          const lpn = store.tenantLpns.find(l => l.id === lpnId);
          if (!lpn) return;
          const item = store.tenantItems.find(i => i.id === lpn.itemId);
          const conv = UomEngine.convert(item, deductQty, deductUom);
          const loc = store.tenantLocations.find(l => l.id === lpn.locationId);
          const fac = store.tenantFacilities.find(f => f.id === lpn.facilityId);

          if (conv.baseUnits > lpn.quantityBase) {
            this.showToast('Cannot deduct more than available LPN balance!', 'warning');
            return;
          }

          lpn.quantityBase = Number((lpn.quantityBase - conv.baseUnits).toFixed(2));

          if (lpn.quantityBase <= 0) {
            lpn.status = 'dispatched';
            // Archive/remove empty LPN from bin
            store.state.licensePlates[store.state.activeTenantId] = store.tenantLpns.filter(l => l.id !== lpn.id);
          }

          const newTx = {
            id: `tx-${Date.now().toString().slice(-4)}`,
            timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
            type: reasonLabels[reasonCode] || 'Stock Outbound',
            lpn: lpn.lpnNumber,
            sku: item ? item.sku : 'N/A',
            from: `${fac ? fac.code : ''} / ${loc ? loc.code : ''}`,
            to: destination || reference || 'Customer Site',
            qty: `-${conv.baseUnits.toLocaleString()} ${item && item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'} (${conv.fullCases} Cases)`,
            user: store.activeTenant.adminUser.name,
            note: `${reference} (${destination || 'Outbound'})`
          };

          store.state.transactions[store.state.activeTenantId].unshift(newTx);
          store.save();
          this.closeModal('adjustStockModal');
          this.renderAll();
          this.showToast(`Deducted ${conv.baseUnits.toLocaleString()} units from ${lpn.lpnNumber} for ${reference}`, 'success');

        } else {
          // Summary Mode Outbound Deduction
          const item = store.tenantItems.find(i => i.id === itemId);
          if (!item) return;
          const conv = UomEngine.convert(item, deductQty, deductUom);
          const activeFacId = store.state.activeFacilityId;
          const fac = store.tenantFacilities.find(f => f.id === activeFacId);

          // Deduct from facility LPNs/stock
          let remainingToDeduct = conv.baseUnits;
          const facLpns = store.tenantLpns.filter(l => l.itemId === item.id && (activeFacId === 'all' || l.facilityId === activeFacId));

          for (const lpn of facLpns) {
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

          const newTx = {
            id: `tx-${Date.now().toString().slice(-4)}`,
            timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
            type: reasonLabels[reasonCode] || 'Summary Outbound',
            lpn: 'SUMMARY-OUT',
            sku: item.sku,
            from: fac ? `${fac.code} Bulk` : 'Warehouse Stock',
            to: destination || reference || 'Dispatched',
            qty: `-${conv.baseUnits.toLocaleString()} ${item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'} (${conv.fullCases} Cases)`,
            user: store.activeTenant.adminUser.name,
            note: `${reference} (${destination || 'Outbound'})`
          };

          store.state.transactions[store.state.activeTenantId].unshift(newTx);
          store.save();
          this.closeModal('adjustStockModal');
          this.renderAll();
          this.showToast(`Deducted ${conv.baseUnits.toLocaleString()} units of ${item.sku} for ${reference}`, 'success');
        }
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
        const trackingMode = document.getElementById('newFacilityTrackingMode').value;

        const newFac = {
          id: `fac-${Date.now()}`,
          code,
          name,
          type,
          address: 'Operational Hub',
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

    // 8. Onboard Tenant Form (Developer Portal)
    const createTenantForm = document.getElementById('createTenantForm');
    if (createTenantForm) {
      createTenantForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const companyName = document.getElementById('newTenantName').value.trim();
        const adminName = document.getElementById('newTenantAdminName').value.trim();
        const adminEmail = document.getElementById('newTenantAdminEmail').value.trim();
        const template = document.getElementById('newTenantTemplate').value;

        const newTenantId = `tenant-${Date.now()}`;
        const newTenant = {
          id: newTenantId,
          name: companyName,
          slug: companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          template,
          tier: 'Free Beta Active (0$ / mo)',
          createdAt: new Date().toISOString().slice(0, 10),
          adminUser: { name: adminName, email: adminEmail, role: 'Company Admin' }
        };

        store.state.tenants.push(newTenant);

        if (template === 'flooring') {
          store.state.unitsOfMeasure[newTenantId] = [
            { id: `uom-${Date.now()}-1`, name: 'Square Feet', code: 'SQFT', category: 'area', isBaseDefault: true },
            { id: `uom-${Date.now()}-2`, name: 'Box / Carton', code: 'BOX', category: 'count', isBaseDefault: false },
            { id: `uom-${Date.now()}-3`, name: 'Pallet', code: 'PLT', category: 'count', isBaseDefault: false }
          ];
          store.state.customFields[newTenantId] = [
            { id: `udf-${Date.now()}-1`, key: 'sqft_per_box', label: 'Sq Ft per Box', type: 'number', required: true, showInGrid: true, entity: 'item' },
            { id: `udf-${Date.now()}-2`, key: 'color_stain', label: 'Color / Stain', type: 'text', required: true, showInGrid: true, entity: 'item' },
            { id: `udf-${Date.now()}-3`, key: 'dye_lot_run', label: 'Dye Lot / Run #', type: 'text', required: true, showInGrid: true, entity: 'lpn' }
          ];
        } else {
          store.state.unitsOfMeasure[newTenantId] = [
            { id: `uom-${Date.now()}-1`, name: 'Each', code: 'EA', category: 'count', isBaseDefault: true },
            { id: `uom-${Date.now()}-2`, name: 'Case', code: 'CS', category: 'count', isBaseDefault: false },
            { id: `uom-${Date.now()}-3`, name: 'Pallet', code: 'PLT', category: 'count', isBaseDefault: false }
          ];
          store.state.customFields[newTenantId] = [
            { id: `udf-${Date.now()}-1`, key: 'oem_part_no', label: 'OEM Part Number', type: 'text', required: true, showInGrid: true, entity: 'item' },
            { id: `udf-${Date.now()}-2`, key: 'batch_tag', label: 'Batch / Lot Tag', type: 'text', required: true, showInGrid: true, entity: 'lpn' }
          ];
        }

        const defaultFacId = `fac-${Date.now()}`;
        store.state.facilities[newTenantId] = [
          { id: defaultFacId, code: 'FAC-01', name: 'Main Warehouse', type: 'warehouse', address: '100 Distribution Way', trackingMode: 'lpn' }
        ];
        store.state.locations[newTenantId] = [
          { id: `loc-${Date.now()}-1`, facilityId: defaultFacId, code: 'A01-R01-A', name: 'Aisle 1, Rack 1', zone: 'racking', capacity: 4, barcode: 'LOC-A01-01' }
        ];
        store.state.items[newTenantId] = [];
        store.state.licensePlates[newTenantId] = [];
        store.state.transactions[newTenantId] = [];
        store.state.users[newTenantId] = [
          { id: `usr-${Date.now()}`, name: adminName, email: adminEmail, role: 'Company Admin', facilities: 'All Facilities', status: 'Active' }
        ];

        store.state.activeTenantId = newTenantId;
        store.state.activeFacilityId = defaultFacId;
        store.save();
        this.closeModal('createTenantModal');
        this.renderAll();
        this.showToast(`Company '${companyName}' onboarded and activated!`, 'success');
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

    // Tenant UOM Builder
    document.getElementById('btnAddNewUom')?.addEventListener('click', () => {
      const uomName = prompt('Enter Unit of Measure Name (e.g., "Linear Yard", "Bundle", "Drum"):');
      if (uomName && uomName.trim()) {
        const code = prompt('Enter Short Code (e.g., "LYD", "BDL", "DRM"):') || uomName.slice(0, 3).toUpperCase();
        const newUom = {
          id: `uom-${Date.now()}`,
          name: uomName.trim(),
          code: code.trim().toUpperCase(),
          category: 'count',
          isBaseDefault: false
        };
        store.state.unitsOfMeasure[store.state.activeTenantId].push(newUom);
        store.save();
        this.renderTenantSettings();
        this.showToast(`Added Unit of Measure '${uomName}' (${code})`, 'success');
      }
    });

    document.getElementById('btnSaveTenantConfig')?.addEventListener('click', () => {
      this.showToast('Tenant configuration saved & synced!', 'success');
    });

    // Copy Invite Link Button
    document.getElementById('btnCopyInviteLink')?.addEventListener('click', () => {
      const input = document.getElementById('generatedInviteUrl');
      if (input) {
        input.select();
        navigator.clipboard?.writeText(input.value);
        this.showToast('Onboarding invite link copied to clipboard!', 'info');
      }
    });

    // Barcode Scanner Manual Entry
    document.getElementById('btnSubmitManualScan')?.addEventListener('click', () => {
      const barcode = document.getElementById('manualScanInput').value.trim();
      if (barcode) this.processBarcodeScan(barcode);
    });
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
    this.renderDeveloperPortal();
    this.populateModalSelects();
    this.initIcons();
  }

  // ============================================================================
  // HEADER RENDERING
  // ============================================================================
  renderHeader() {
    this.tenantSelect.innerHTML = store.state.tenants.map(t => `
      <option value="${t.id}" ${t.id === store.state.activeTenantId ? 'selected' : ''}>${t.name}</option>
    `).join('');

    this.globalFacilitySelect.innerHTML = `
      <option value="all">All Facilities</option>
      ${store.tenantFacilities.map(f => `
        <option value="${f.id}" ${f.id === store.state.activeFacilityId ? 'selected' : ''}>${f.code} - ${f.name} (${f.trackingMode === 'lpn' ? 'LPN' : 'Summary'})</option>
      `).join('')}
    `;

    document.getElementById('currentTenantSub').textContent = store.activeTenant.name;
    document.getElementById('sidebarTenantName').textContent = store.activeTenant.name;
    document.getElementById('totalLpnBadge').textContent = store.tenantLpns.length;
    document.getElementById('userName').textContent = store.activeTenant.adminUser.name;

    this.updateInventoryModeUI();
  }

  updateInventoryModeUI() {
    const lpnSupported = this.isCurrentFacilityLpnEnabled();

    if (!lpnSupported) {
      store.state.inventoryMode = 'summary';
    }

    const isLpn = store.state.inventoryMode === 'lpn' && lpnSupported;

    // Header Mode Toggle
    if (!lpnSupported) {
      this.headerModePillToggle.style.display = 'none';
      this.headerLockedSummaryBadge.classList.remove('hidden');
    } else {
      this.headerModePillToggle.style.display = 'flex';
      this.headerLockedSummaryBadge.classList.add('hidden');
      this.headerModeLpnBtn.classList.toggle('active', isLpn);
      this.headerModeSummaryBtn.classList.toggle('active', !isLpn);
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
        this.viewToggleSummary.classList.add('active');
      } else {
        this.viewToggleLpn.style.display = 'inline-flex';
        this.viewToggleLpn.classList.toggle('active', isLpn);
        this.viewToggleSummary.classList.toggle('active', !isLpn);
      }
    }

    this.lpnModeContainer.classList.toggle('active', isLpn);
    this.summaryModeContainer.classList.toggle('active', !isLpn);

    if (!lpnSupported) {
      this.inventoryModeBadge.textContent = 'Facility Locked: Summary Mode';
      this.inventoryModeBadge.className = 'badge badge-warning';
    } else {
      this.inventoryModeBadge.textContent = isLpn ? 'LPN Pallet Tracking Active' : 'Summary Stock Mode Active';
      this.inventoryModeBadge.className = isLpn ? 'badge badge-primary' : 'badge badge-accent';
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
        store.tenantFacilities.map(f => `<option value="${f.id}">${f.code} - ${f.name} (${f.trackingMode === 'lpn' ? 'LPN' : 'Summary'})</option>`).join('');
      if (facilityFilter !== 'all') this.filterFacilitySelect.value = facilityFilter;
    }

    const udfList = store.tenantCustomFields.map(u => `<strong>${u.label}</strong>`).join(', ');
    document.getElementById('udfBannerText').innerHTML = `Displaying Tenant Custom Attributes: ${udfList || 'None configured'}`;

    const filteredLpns = store.tenantLpns.filter(lpn => {
      const item = store.tenantItems.find(i => i.id === lpn.itemId);
      const loc = store.tenantLocations.find(l => l.id === lpn.locationId);

      if (facilityFilter !== 'all' && lpn.facilityId !== facilityFilter) return false;
      if (statusFilter !== 'all' && lpn.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item && item.category !== categoryFilter) return false;

      if (searchTerm) {
        const customValues = Object.values(lpn.customFields || {}).join(' ').toLowerCase();
        const matchesSearch =
          lpn.lpnNumber.toLowerCase().includes(searchTerm) ||
          (item && item.sku.toLowerCase().includes(searchTerm)) ||
          (item && item.name.toLowerCase().includes(searchTerm)) ||
          (loc && loc.code.toLowerCase().includes(searchTerm)) ||
          customValues.includes(searchTerm);
        if (!matchesSearch) return false;
      }
      return true;
    });

    // 1. RENDER LPN CARDS GRID
    const lpnGrid = document.getElementById('lpnCardsGrid');
    if (filteredLpns.length === 0) {
      lpnGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
          <i data-lucide="package-x" style="width: 48px; height: 48px; color: var(--text-dim); margin-bottom: 0.5rem;"></i>
          <h3 style="font-size: 1.1rem; color: var(--text-main);">No License Plates Found</h3>
          <p class="text-muted" style="font-size: 0.85rem; margin-top: 0.25rem;">Try adjusting your filters or click 'Receive Inbound Stock' to generate an LPN.</p>
        </div>
      `;
    } else {
      lpnGrid.innerHTML = filteredLpns.map(lpn => {
        const item = store.tenantItems.find(i => i.id === lpn.itemId) || { sku: 'UNKNOWN', name: 'Unknown SKU', baseUomId: 'uom-sqft', packaging: { caseMultiplier: 1, palletMultiplier: 1 } };
        const loc = store.tenantLocations.find(l => l.id === lpn.locationId);
        const fac = store.tenantFacilities.find(f => f.id === lpn.facilityId);
        const packagingBadge = UomEngine.formatPackagingBadge(item, lpn.quantityBase);

        const customTagsHtml = Object.entries(lpn.customFields || {}).map(([key, val]) => {
          const udfMeta = store.tenantCustomFields.find(u => u.key === key);
          const label = udfMeta ? udfMeta.label : key;
          return `<div class="udf-tag">${label}: <strong>${val}</strong></div>`;
        }).join('');

        let statusClass = 'badge-success';
        if (lpn.status === 'reserved') statusClass = 'badge-warning';
        if (lpn.status === 'damaged') statusClass = 'badge-danger';

        return `
          <div class="lpn-card">
            <div class="lpn-card-top">
              <div class="lpn-barcode-tag">
                <span class="lpn-tag-number"><i data-lucide="qr-code" style="width:16px;height:16px;"></i> ${lpn.lpnNumber}</span>
                <span class="lpn-barcode-graphic">||| | |||| | || |||</span>
              </div>
              <span class="badge ${statusClass}">${lpn.status.toUpperCase()}</span>
            </div>

            <div>
              <h3 class="lpn-item-title">${item.name}</h3>
              <span class="lpn-sku-pill">${item.sku} &bull; ${item.category}</span>
            </div>

            <div>
              <div class="lpn-location-pill">
                <i data-lucide="map-pin" style="width:14px;height:14px;color:var(--accent-cyan);"></i>
                <span>${fac ? fac.code : ''} &bull; <strong>${loc ? loc.code : 'Unassigned'}</strong></span>
              </div>
            </div>

            ${customTagsHtml ? `<div class="lpn-custom-attributes">${customTagsHtml}</div>` : ''}

            <div class="lpn-quantities-row">
              <div>
                <div class="lpn-primary-qty">${lpn.quantityBase.toLocaleString()} <span style="font-size:0.8rem;font-weight:600;color:var(--text-muted);">${item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'}</span></div>
                <div class="lpn-packaging-calc">${packagingBadge}</div>
              </div>
            </div>

            <div class="lpn-card-actions">
              <button class="btn btn-secondary btn-sm" onclick="app.triggerMoveModal('${lpn.id}')" title="Move to another bin">
                <i data-lucide="arrow-right-left"></i> Move
              </button>
              <button class="btn btn-primary btn-sm" onclick="app.triggerAdjustModal('${lpn.id}')" title="Pick / Adjust stock out of this LPN">
                <i data-lucide="package-minus"></i> Pick Out
              </button>
              <button class="btn btn-secondary btn-sm" onclick="app.printBarcodeTag('${lpn.lpnNumber}')" title="Print LPN Label">
                <i data-lucide="printer"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // 2. RENDER SUMMARY MODE TABLE
    const summaryBody = document.getElementById('summaryStockTableBody');
    const items = store.tenantItems;

    const summaryRows = [];
    items.forEach(item => {
      store.tenantFacilities.forEach(fac => {
        const itemLpns = store.tenantLpns.filter(l => l.itemId === item.id && l.facilityId === fac.id);
        const totalBase = itemLpns.reduce((sum, l) => sum + l.quantityBase, 0);

        if (totalBase > 0) {
          summaryRows.push({
            item,
            facility: fac,
            totalBase,
            lpnCount: itemLpns.length
          });
        }
      });
    });

    if (summaryRows.length === 0) {
      summaryBody.innerHTML = `<tr><td colspan="8" class="text-muted" style="text-align:center; padding:2rem;">No stock records in summary view.</td></tr>`;
    } else {
      summaryBody.innerHTML = summaryRows.map(row => {
        const packaging = UomEngine.formatPackagingBadge(row.item, row.totalBase);
        return `
          <tr>
            <td>
              <strong class="font-mono text-primary">${row.item.sku}</strong><br>
              <span style="font-size:0.8rem;color:var(--text-muted);">${row.item.name}</span>
            </td>
            <td><span class="badge badge-subtle">${row.item.category}</span></td>
            <td><strong>${row.facility.code}</strong> - ${row.facility.name}</td>
            <td><span class="text-muted">${row.lpnCount} Bin Locations</span></td>
            <td><strong class="font-mono text-lg">${row.totalBase.toLocaleString()}</strong> <small class="text-muted">${row.item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'}</small></td>
            <td><span class="badge badge-primary">${packaging}</span></td>
            <td><span class="badge badge-success">IN STOCK</span></td>
            <td>
              <div style="display:flex; gap:0.35rem;">
                <button class="btn btn-xs btn-secondary" onclick="app.triggerReceiveForItem('${row.item.id}')" title="Add Stock">
                  <i data-lucide="plus"></i> Add
                </button>
                <button class="btn btn-xs btn-outline" onclick="app.triggerAdjustModal(null, '${row.item.id}')" title="Adjust / Pick Stock Out">
                  <i data-lucide="package-minus"></i> Pick
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
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
    const grid = document.getElementById('manufacturersGrid');
    const mfrs = store.tenantManufacturers;

    grid.innerHTML = mfrs.map(mfr => {
      const itemsCount = store.tenantItems.filter(i => i.manufacturerId === mfr.id).length;
      const initials = mfr.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

      return `
        <div class="mfr-card">
          <div class="mfr-header">
            <div class="mfr-avatar">${initials}</div>
            <div>
              <h3 class="mfr-title">${mfr.name}</h3>
              <span class="badge badge-subtle">${itemsCount} Active SKUs</span>
            </div>
          </div>

          <div class="mfr-contact-list">
            <div class="mfr-contact-item">
              <i data-lucide="user"></i>
              <span>Rep: <strong>${mfr.repName || 'Account Rep'}</strong></span>
            </div>
            <div class="mfr-contact-item">
              <i data-lucide="phone"></i>
              <span>${mfr.repPhone || 'N/A'}</span>
            </div>
            <div class="mfr-contact-item">
              <i data-lucide="mail"></i>
              <span>${mfr.repEmail || 'orders@supplier.com'}</span>
            </div>
            <div class="mfr-contact-item">
              <i data-lucide="clock"></i>
              <span>Average Lead Time: <strong>${mfr.leadTimeDays || 5} Days</strong></span>
            </div>
          </div>

          <div class="mt-2" style="border-top:1px solid var(--border-subtle); padding-top:0.6rem;">
            <span style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">Associated Lines:</span>
            <div style="display:flex; flex-wrap:wrap; gap:0.3rem; margin-top:0.3rem;">
              ${(mfr.brandLines || []).map(line => `<span class="badge badge-subtle" style="font-size:0.68rem;">${line}</span>`).join('')}
            </div>
          </div>
        </div>
      `;
    }).join('');
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
  // TENANT CONFIGURATION & CUSTOM FIELD ENGINE (UDFs)
  // ============================================================================
  renderTenantSettings() {
    const udfs = store.tenantCustomFields;
    const udfListEl = document.getElementById('customFieldsEditorList');

    udfListEl.innerHTML = udfs.map(udf => `
      <div class="editor-row-item">
        <i data-lucide="grip-vertical" style="color:var(--text-dim);width:16px;height:16px;"></i>
        <div class="editor-field-name">${udf.label} <small class="font-mono text-muted" style="font-size:0.7rem;">(${udf.key})</small></div>
        <span class="editor-field-type">${udf.type.toUpperCase()}</span>
        <span class="badge ${udf.required ? 'badge-warning' : 'badge-subtle'}">${udf.required ? 'Required' : 'Optional'}</span>
        <button class="btn btn-ghost btn-xs text-muted" onclick="app.removeCustomField('${udf.id}')" title="Delete Field">&times;</button>
      </div>
    `).join('');

    const uoms = store.tenantUoms;
    const uomListEl = document.getElementById('uomEditorList');

    uomListEl.innerHTML = uoms.map(uom => `
      <div class="editor-row-item">
        <i data-lucide="layers" style="color:var(--accent-purple);width:16px;height:16px;"></i>
        <div class="editor-field-name">${uom.name}</div>
        <span class="badge badge-primary font-mono">${uom.code}</span>
        <span class="badge badge-subtle">${uom.category}</span>
        ${uom.isBaseDefault ? '<span class="badge badge-success">BASE DEFAULT</span>' : ''}
      </div>
    `).join('');

    const matrixContainer = document.getElementById('facilityTrackingMatrix');
    if (matrixContainer) {
      matrixContainer.innerHTML = store.tenantFacilities.map(f => {
        const isLpn = f.trackingMode === 'lpn';
        return `
          <div class="facility-matrix-row">
            <div class="facility-matrix-info">
              <div class="facility-matrix-name">
                <i data-lucide="building-2" style="color:var(--accent-cyan);width:16px;height:16px;"></i>
                <span>${f.code} &mdash; ${f.name}</span>
                <span class="badge ${isLpn ? 'badge-primary' : 'badge-warning'}">${isLpn ? 'LPN ENABLED' : 'SUMMARY ONLY (LOCKED)'}</span>
              </div>
              <span class="facility-matrix-sub">${f.type.toUpperCase()} &bull; ${f.address || 'Operational Location'}</span>
            </div>
            <div class="facility-mode-toggle-group">
              <button class="facility-mode-btn ${isLpn ? 'active lpn-active' : ''}" onclick="app.toggleFacilityTrackingMode('${f.id}', 'lpn')">
                <i data-lucide="qr-code"></i> LPN Level
              </button>
              <button class="facility-mode-btn ${!isLpn ? 'active summary-active' : ''}" onclick="app.toggleFacilityTrackingMode('${f.id}', 'summary_only')">
                <i data-lucide="lock"></i> Summary Only
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  removeCustomField(udfId) {
    store.state.customFields[store.state.activeTenantId] = store.tenantCustomFields.filter(u => u.id !== udfId);
    store.save();
    this.renderTenantSettings();
    this.renderInventory();
    this.showToast('Removed custom field', 'info');
  }

  // ============================================================================
  // STAFF & ROLE ACCESS (RBAC)
  // ============================================================================
  renderUsers() {
    const tableBody = document.getElementById('usersTableBody');
    const users = store.tenantUsers;

    tableBody.innerHTML = users.map(usr => `
      <tr>
        <td><strong>${usr.name}</strong></td>
        <td><span class="text-muted">${usr.email}</span></td>
        <td><span class="badge badge-primary">${usr.role}</span></td>
        <td>${usr.facilities}</td>
        <td><span class="badge badge-success">${usr.status}</span></td>
        <td>
          <button class="btn btn-ghost btn-xs" onclick="app.showToast('Permissions updated', 'info')"><i data-lucide="edit-2"></i></button>
        </td>
      </tr>
    `).join('');
  }

  // ============================================================================
  // DEVELOPER PORTAL (CLIENT ONBOARDING)
  // ============================================================================
  renderDeveloperPortal() {
    const grid = document.getElementById('developerTenantsGrid');
    const tenants = store.state.tenants;

    grid.innerHTML = tenants.map(t => {
      const itemsCount = (store.state.items[t.id] || []).length;
      const lpnsCount = (store.state.licensePlates[t.id] || []).length;
      const facsCount = (store.state.facilities[t.id] || []).length;
      const isCurrent = t.id === store.state.activeTenantId;

      return `
        <div class="dev-tenant-card" style="${isCurrent ? 'border-color: var(--primary);' : ''}">
          <div class="dev-tenant-header">
            <div>
              <h3 style="font-size:1.05rem; font-weight:800; color:var(--text-main);">${t.name}</h3>
              <span class="font-mono text-muted" style="font-size:0.72rem;">ID: ${t.id} &bull; ${t.template}</span>
            </div>
            <span class="badge badge-success">${t.tier}</span>
          </div>

          <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:0.5rem; background:var(--bg-input); padding:0.65rem; border-radius:var(--radius-md); text-align:center;">
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted);">Facilities</div>
              <strong style="font-size:1.1rem;">${facsCount}</strong>
            </div>
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted);">SKUs</div>
              <strong style="font-size:1.1rem;">${itemsCount}</strong>
            </div>
            <div>
              <div style="font-size:0.68rem; color:var(--text-muted);">LPNs</div>
              <strong style="font-size:1.1rem;">${lpnsCount}</strong>
            </div>
          </div>

          <div style="font-size:0.78rem; color:var(--text-muted);">
            <div><strong>Company Admin:</strong> ${t.adminUser?.name} (${t.adminUser?.email})</div>
            <div><strong>Onboarded:</strong> ${t.createdAt}</div>
          </div>

          <div class="mt-2" style="display:flex; gap:0.5rem;">
            ${isCurrent ?
              '<button class="btn btn-outline btn-sm" style="flex:1;" disabled><i data-lucide="check"></i> Active Session</button>' :
              `<button class="btn btn-primary btn-sm" style="flex:1;" onclick="app.switchTenantDirect('${t.id}')"><i data-lucide="log-in"></i> Launch Tenant</button>`
            }
          </div>
        </div>
      `;
    }).join('');
  }

  switchTenantDirect(tenantId) {
    store.state.activeTenantId = tenantId;
    const facs = store.tenantFacilities;
    if (facs.length > 0) store.state.activeFacilityId = facs[0].id;
    store.save();
    this.renderAll();
    this.showToast(`Switched into tenant: ${store.activeTenant.name}`, 'success');
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
      const uomDef = store.tenantUoms.find(u => u.id === tier.uomId);
      return `<option value="${tier.id}">1 ${tier.tierName} (${tier.multiplier} ${baseUom?.code || 'Units'})</option>`;
    }).join('');

    if (itemUoms.length > 1) {
      uomSel.value = itemUoms[itemUoms.length - 1].id;
    }
  }

  populateAdjUoms() {
    const isLpnMode = this.isCurrentFacilityLpnEnabled();
    const lpnSel = document.getElementById('adjLpnSelect');
    const itemSel = document.getElementById('adjItemSelect');
    const uomSel = document.getElementById('adjUomSelect');
    if (!uomSel) return;

    let targetItemId = null;
    if (isLpnMode) {
      const lpn = store.tenantLpns.find(l => l.id === lpnSel?.value);
      targetItemId = lpn ? lpn.itemId : store.tenantItems[0]?.id;
    } else {
      targetItemId = itemSel?.value || store.tenantItems[0]?.id;
    }

    if (!targetItemId) return;
    const itemUoms = store.getItemUoms(targetItemId);
    const baseUom = store.getItemBaseUom(targetItemId);

    uomSel.innerHTML = itemUoms.map(tier => {
      const uomDef = store.tenantUoms.find(u => u.id === tier.uomId);
      return `<option value="${tier.id}">1 ${tier.tierName} (${tier.multiplier} ${baseUom?.code || 'Units'})</option>`;
    }).join('');

    if (itemUoms.length > 1) {
      uomSel.value = itemUoms[1].id;
    }
  }

  triggerAdjustModal(lpnId = null, itemId = null) {
    const isLpnMode = this.isCurrentFacilityLpnEnabled();
    const lpnGroup = document.getElementById('adjLpnGroup');
    const itemGroup = document.getElementById('adjItemGroup');
    const lpnSel = document.getElementById('adjLpnSelect');
    const itemSel = document.getElementById('adjItemSelect');

    if (isLpnMode) {
      lpnGroup.style.display = 'flex';
      itemGroup.style.display = 'none';

      lpnSel.innerHTML = store.tenantLpns.map(l => {
        const item = store.tenantItems.find(i => i.id === l.itemId);
        const loc = store.tenantLocations.find(loc => loc.id === l.locationId);
        return `<option value="${l.id}" ${l.id === lpnId ? 'selected' : ''}>${l.lpnNumber} &bull; ${item ? item.sku : ''} (${l.quantityBase} ${item && item.baseUomId === 'uom-sqft' ? 'SqFt' : 'Ea'} in ${loc ? loc.code : 'Bin'})</option>`;
      }).join('');
      if (lpnId) lpnSel.value = lpnId;
    } else {
      lpnGroup.style.display = 'none';
      itemGroup.style.display = 'flex';

      itemSel.innerHTML = store.tenantItems.map(i => {
        const facLpns = store.tenantLpns.filter(l => l.itemId === i.id);
        const total = facLpns.reduce((s, l) => s + l.quantityBase, 0);
        return `<option value="${i.id}" ${i.id === itemId ? 'selected' : ''}>${i.sku} - ${i.name} (Total In Stock: ${total.toLocaleString()} ${i.baseUomId === 'uom-sqft' ? 'SqFt' : 'Ea'})</option>`;
      }).join('');
      if (itemId) itemSel.value = itemId;
    }

    this.populateAdjUoms();
    document.getElementById('adjConsumeAllCheckbox').checked = false;
    document.getElementById('adjQuantityInput').value = '1';

    this.updateAdjPreviewCard();
    this.openModal('adjustStockModal');

    // Trigger calculation update
    const qtyInput = document.getElementById('adjQuantityInput');
    qtyInput.dispatchEvent(new Event('input'));
  }

  updateAdjPreviewCard() {
    const isLpnMode = this.isCurrentFacilityLpnEnabled();
    const previewEl = document.getElementById('adjStockPreviewCard');
    const lpnSel = document.getElementById('adjLpnSelect');
    const itemSel = document.getElementById('adjItemSelect');

    if (isLpnMode) {
      const lpn = store.tenantLpns.find(l => l.id === lpnSel.value) || store.tenantLpns[0];
      if (lpn) {
        const item = store.tenantItems.find(i => i.id === lpn.itemId);
        const loc = store.tenantLocations.find(loc => loc.id === lpn.locationId);
        const fac = store.tenantFacilities.find(f => f.id === lpn.facilityId);
        const pkg = UomEngine.formatPackagingBadge(item, lpn.quantityBase);

        previewEl.innerHTML = `
          <div style="font-size:0.82rem; line-height:1.4;">
            <div style="display:flex; justify-content:space-between;">
              <span><strong>Source LPN:</strong> <span class="font-mono text-primary">${lpn.lpnNumber}</span> (${item ? item.sku : ''})</span>
              <span class="badge badge-success">${lpn.status.toUpperCase()}</span>
            </div>
            <div><strong>Stored At:</strong> ${fac ? fac.code : ''} &bull; ${loc ? loc.code : 'Bin'} (${loc ? loc.name : ''})</div>
            <div><strong>Available Stock:</strong> <span class="font-mono text-lg font-bold">${lpn.quantityBase.toLocaleString()}</span> ${item && item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'} &bull; <span class="badge badge-primary">${pkg}</span></div>
          </div>
        `;
      }
    } else {
      const item = store.tenantItems.find(i => i.id === itemSel.value) || store.tenantItems[0];
      if (item) {
        const activeFacId = store.state.activeFacilityId;
        const facLpns = store.tenantLpns.filter(l => l.itemId === item.id && (activeFacId === 'all' || l.facilityId === activeFacId));
        const total = facLpns.reduce((s, l) => s + l.quantityBase, 0);
        const pkg = UomEngine.formatPackagingBadge(item, total);

        previewEl.innerHTML = `
          <div style="font-size:0.82rem; line-height:1.4;">
            <div><strong>Product:</strong> <span class="font-mono text-primary">${item.sku}</span> &mdash; ${item.name}</div>
            <div><strong>Facility Summary:</strong> ${store.activeTenant.name}</div>
            <div><strong>Total Available:</strong> <span class="font-mono text-lg font-bold">${total.toLocaleString()}</span> ${item.baseUomId === 'uom-sqft' ? 'Sq Ft' : 'Ea'} &bull; <span class="badge badge-primary">${pkg}</span></div>
          </div>
        `;
      }
    }
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
      ...items.map(i => ({ code: i.barcode, label: `SKU (${i.sku})` }))
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
      `;
      resultCard.classList.remove('hidden');
      this.initIcons();
      return;
    }

    // 3. Check if Item SKU
    const itemMatch = store.tenantItems.find(i => i.sku.toLowerCase() === cleanCode.toLowerCase() || i.barcode.toLowerCase() === cleanCode.toLowerCase());
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
    this.showToast(`Thermal Label Print Command sent for ${tag} (Zebra/Brother 4x6 format)`, 'info');
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
