# Simpletory: Next-Gen Multi-Tenant Flooring WMS & Inventory

**Simpletory** is a modern, responsive, web-based Warehouse Management System (WMS) engineered specifically for flooring retailers, distributors, and installation contractors. It features **multi-tenant isolation**, a **Facility $\rightarrow$ Warehouse Location** hierarchy, **Dual-Mode Inventory Tracking** (License Plate Numbers vs. Summary counts), **Multi-Level Units of Measure (UOM) with Packaging Hierarchies**, and **Tenant-Configurable Custom Fields (UDFs)**.

---

## 🚀 How to Run the Interactive Demo

The demo is completely self-contained in standard modern HTML5, CSS3, and JavaScript — no build steps or dependencies required.

### Option 1: Direct File Open
Simply double-click [`index.html`](./index.html) or open it in any modern browser (Chrome, Safari, Edge, Firefox, iPad, or mobile phone).

### Option 2: Local HTTP Server
Run any local server in the workspace directory:
```bash
# Python
python3 -m http.server 3000

# Node / npx
npx serve .
```
Then visit `http://localhost:3000` in your browser.

---

## 🌟 Key Features in the Interactive Mockup

### 1. Dual-Mode Inventory Tracking
- **LPN Mode (License Plate Number / Pallet Bin Tracking)**: Visual pallet and roll cards with barcodes, exact bin location tags (e.g., `FAC-01 / A01-R01-A`), dye-lot badges, and instant relocation actions.
- **Summary Mode (Bulk Location Count)**: Aggregated inventory matrix for simpler operations or mobile service vans.
- One-click toggle switch between modes in the header or inventory view.

### 2. Multi-Level Unit of Measure (UOM) Engine
- Try the interactive **UOM Converter** in the sidebar:
  - **Scenario A**: Enter `1 Pallet` $\rightarrow$ Rolls down to `60 Cases` or `1,800 Eaches/Sq Ft`.
  - **Scenario B**: Enter `60 Eaches` $\rightarrow$ Infers `2 Full Cases`.
  - **Scenario C**: Enter `65 Eaches` $\rightarrow$ Computes `2 Cases + 5 Loose Eaches` (Broken Case handling).
  - Quick-preset test buttons to simulate common warehouse receiving and picking scenarios.

### 3. Tenant Configuration & Custom Field Builder (UDFs)
- Go to **Tenant Admin $\rightarrow$ Custom Fields & UOMs**:
  - Add or rename custom attributes (e.g. *"Square Foot per Box"*, *"Color / Stain"*, *"Dye Lot / Run #"*, *"Wear Layer"*).
  - Add custom Units of Measure.
  - Watch the newly configured fields automatically inject into item setup forms, inbound receiving modals, and table grids!

### 4. Interactive Barcode & LPN Scanner
- Click **"Scan Barcode"** in the top header or the mobile FAB button.
- Experience the live camera laser viewfinder simulation.
- Click any of the test barcode chips (`LPN-849201`, `LOC-A01-R01-A`, `SKU-OAK-01`) to see instant record lookup and quick relocation workflows.

### 5. Multi-Tenant Switcher & Developer Master Portal
- Switch between **"Apex Flooring & Tile (Tenant A - Flooring Specialist)"** and **"Cascade Logistics (Tenant B - General WMS)"** to observe how custom fields and UOMs isolate per company.
- Visit the **Developer Onboarding Portal** to generate zero-cost onboarding links and activate new client companies.

---

## 🏗️ Architecture & Technology Stack (100% Free Tier)

| Component | Free Service | Capacity / Quota |
| :--- | :--- | :--- |
| **Database & Auth** | [Supabase](https://supabase.com) (PostgreSQL + RLS + JSONB) | 50,000 MAU Auth, 500MB DB, Realtime subscriptions |
| **Frontend & Hosting** | [Cloudflare Pages](https://pages.cloudflare.com) / [Vercel](https://vercel.com) | Unlimited bandwidth, custom domains, automated CI/CD |
| **Transactional Email** | [Resend](https://resend.com) / Supabase SMTP | 3,000 free emails/mo for tenant invites |
| **Barcode Scanner** | HTML5 Camera API / `html5-qrcode` | Native in-browser WebRTC (zero external hardware cost) |

---

## 📁 Repository Structure
```
Simpletory/
├── index.html       # Single-page responsive WMS interface
├── styles.css       # Industrial dark/light theme, glassmorphism & responsive CSS
├── app.js           # Reactive multi-tenant engine & UOM calculator in localStorage
└── README.md        # Project guide & architecture overview
```
