# LiteBI Studio – Agent Briefing

## Ziel
Eine rein browserbasierte, modular erweiterbare IT-Controlling-WebApp (Dashboard-Shell) mit Kachel-Startseite.
Daten zunächst fiktiv (Demo small/large). Später Excel-Import + Mapping auf kanonisches Modell.
Storage/Query lokal: SQLite (WASM). Keine Serverkomponenten, keine externen Calls.

## Must-have Architektur
- Schichten: Sources → Ingest (Read/Map/Validate) → Storage (SQLite schema/views) → Analytics (SQL) → UI (Tiles)
- Tiles konfigurierbar über config/tiles.json, jede Tile als Modul/Plugin
- Zentraler Tailwind-Style (eine CSS-Quelle), konsistente UI-Komponenten
- Sicherheitsprinzip: Echtdaten bleiben lokal (File Picker), keine Telemetrie
- Sprache soll änderbar sein (Deustch/Englisch)
- UI soll Responsive sein

## Erste Tiles
1) IT-Kosten (KPI + Drilldown)
2) Operations (Link zu ITSM – URL konfigurierbar)

## Deliverables
- Repo-Struktur + lauffähiger Skeleton
- schema.sql + views.sql + Indizes
- Demo-Daten-Generator (small/large)
- README (lokal starten)
