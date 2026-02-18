# 📊 LiteBI Studio

A high-performance, browser-based business intelligence platform with local SQLite persistence and no-code reporting capabilities.

![LiteBI Studio Preview](https://via.placeholder.com/800x400?text=LiteBI+Studio+Preview)

## 🚀 Key Features

- **Multi-Dashboard Support**: Create, manage, and arrange multiple dashboards with a drag-and-drop grid system.
- **Visual & SQL Query Builder**: 
  - **Visual Mode**: Drag-and-drop interface for table selection, filtering, and aggregation.
  - **SQL Mode**: Full SQL editor for advanced users with real-time preview and charting.
- **Modular Data Import**: 
  - **Smart Import**: Automated schema generation from Excel files.
  - **Generic Import**: Direct mapping of Excel data to existing database structures with pre-import validation.
- **Interactive Worklist**: 
  - Centralized management of flagged records.
  - Integrated status tracking and commenting.
  - Automatic existence checks for source records.
- **Advanced Visualization**: 
  - Responsive charts (Pie, Bar, Line, Area) with multi-series support.
  - Direct integration into dashboards as custom widgets.
- **Reporting & Export**:
  - High-quality PDF and Image export of dashboards and query results.
  - **Presentation Mode** for clean, distractions-free screen sharing.
- **Multi-Language Support**: Full internationalization support with instant switching between English and German.
- **Security & Privacy**:
  - **App Lock**: Optional password protection for the entire interface.
  - **Encrypted Backups**: Password-protected database exports using AES encryption.
- **Zero-Backend Architecture**: Runs entirely in the browser using SQLite WASM + OPFS for maximum performance and data sovereignty.

## 🛠️ Tech Stack

- **Framework**: React 18 + TypeScript (Vite)
- **Styling**: Tailwind CSS (Modular Utility First)
- **Database**: SQLite WASM + OPFS (Persistent Browser Storage)
- **Visualization**: Recharts & Lucide Icons
- **Internationalization**: i18next & react-i18next
- **PDF Core**: html2canvas & jsPDF

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16.x or later)
- [npm](https://www.npmjs.com/)

### Installation & Development

1.  **Clone & Install**:
    ```bash
    git clone https://github.com/litebistudio/litebistudio.git
    cd litebistudio
    npm install
    ```

2.  **Run Locally**:
    ```bash
    npm run dev
    ```

3.  **Build Phase**:
    ```bash
    npm run build
    ```

## 🏗️ Project Architecture

- `src/app/`: Primary UI layer including views, components, and dashboard registry.
- `src/hooks/`: Unified infrastructure hooks for data fetching, reporting, and state.
- `src/lib/`: Core system logic (Database worker, Cryptography, Repositories).
- `src/config/`: Component definitions and registry configurations.
- `src/locales/`: Translation files (JSON) for all supported languages.
- `src/datasets/`: Initial SQL schemas, views, and demo data structures.

## 🌍 Deployment (GitHub Pages)

This project is optimized for static hosting while maintaining full database features.

1.  **Build**: Execute `npm run build`.
2.  **COI Headers**: Uses `coi-serviceworker.js` to enable SharedArrayBuffer/OPFS support on GitHub Pages without server-side header configuration.
3.  **Fallback**: Gracefully falls back to an in-memory database if OPFS is unavailable.

## 🔒 Security & Data Privacy

- **No External Tracking**: No telemetry or external API calls are made.
- **Local Only**: Your data never leaves your browser unless you explicitly export a backup.
- **AES-GCM Encryption**: Used for protecting backups and the application lock.

---
Built with ❤️ for Data Sovereignty and Insights.
