# NUSA HMI — SCADA/HMI Builder (PRD)

## Original Problem Statement
Buat aplikasi scada yang tampilannya bisa kita atur2 sendiri seperti aplikasi desain HMI yang support protokol s7-1200/1500, s7-200, wecon, omron, haiwell, weintek, dan juga fitur deploy web appnya setelah builder supaya bisa dipakai pada end-client.
Extra: import photo, shape, font; widgets gauge, bar, history trend, chart trend, alarm record, data record; automatic max character length for 16/32-bit types with automatic decimal point.

## User Choices
- Tag simulator + real driver (S7 via snap7, Omron FINS TCP, Modbus TCP for Wecon/Haiwell/Weintek)
- Drag & drop canvas + standard widgets bound to tags
- Publish -> public runtime URL (read/operate)
- JWT email/password login; dark industrial theme; UI in Indonesian

## Architecture
- Backend FastAPI: server.py (routes), auth.py (JWT+bcrypt), drivers.py (S7/Modbus/FINS), engine.py (1s poll loop, simulator, alarms, history logging every 5s, TTL 7 days), formats.py (data type spec/max chars), seed.py (demo project), storage.py (Emergent object storage for images/fonts)
- Mongo collections: users, projects (screens/widgets JSON, published snapshot), devices, tags, tag_history, alarms, files, login_attempts
- Frontend React: /login, /projects, /projects/:id/config (devices & tags), /projects/:id/editor (builder), /preview/:id, /view/:slug (public runtime)
- Runtime API shared by preview (auth) and public (slug): values, write, history, alarms, ack

## Implemented (2026-06)
- Auth (register/login/logout/me/refresh, brute force lock), admin seed + demo project per new user
- Device manager for 8 protocol profiles, simulate toggle, connection test, live status
- Tag manager with address validation per protocol, auto max chars/format mask/range by data type & decimals, simulator modes, alarms HH/H/L/LL/BOOL, logging
- HMI editor: 18 widgets (label, rect, circle, line/pipe with flow animation, image, button, switch, lamp, numeric, setpoint input, slider, gauge, bar, tank, realtime trend, history trend, alarm record, data record w/ CSV), drag/resize/snap/grid/zoom, undo/redo, copy/paste/duplicate, z-order, multi-screen with goto navigation, image upload, custom font import, live values in editor
- Publish dialog (snapshot, allow operate toggle, URL copy, unpublish), public runtime with auto scaling, fullscreen, screen switcher, alarm counter, read-only mode

## Implemented — Iteration 2 (2026-06)
- Industrial symbols (pump, valve, motor, conveyor, fan) with bit/word multi-state colors + animation
- Bit/Word Button, Bit/Word Lamp with 6 button shapes / 5 lamp shapes, multi-state editor (value, text, bg, text color, blink); bit modes Set ON/Set OFF/Momentary (ms pulse, 0 = hold)/Switch; word modes set value/inc/dec/cycle; optional monitor tag
- Character Display (ASCII from word, auto 2 chars/word, or message per value); Numeric Display
- Function Button: Open Screen, Open Subscreen (popup screens w/ own size), Previous, Next, Close Subscreen
- Editor multi-select (shift+click, marquee, Ctrl+A), align/distribute, same width/height/size from last-selected, group/ungroup (Ctrl+G), multi move/duplicate/delete
- Client security: per-project groups (level, operate, ack, manage users, screen access) + users; runtime login gate, change own password, manage lower-level users; widget min security level
- Address library: per-protocol address map + quick add, tag tree by Bit/Word/DWord/Float, auto data type from address, TIA Portal (.xlsx/.csv) import, CSV export; SCADA internal memory LB/LW (persisted)
- Project settings: byte order (ABCD/CDAB/BADC/DCBA, per-device override), initial screen, screen saver; Modbus RTU RS485 serial + RTU over TCP
- Builder admin: amoskun99@gmail.com

## Implemented — Iteration 3 (2026-06)
- Data Records: max 100 per project, up to 99 channel addresses each, sampling interval, stored in record_samples (TTL 90 days)
- History Trend widget: source = data record number + per-line enable/type(line/dash/step/area)/width/color; appearance (x/y grids, bg, grid color, date & time format, slider, opacity); Y limits; start time (latest/custom) + span with prev/next/now navigation
- Data Record table widget bound to record number; Alarm Record widget with group filter + GRP column
- Function Button "Export Data Record → PDF" (runtime dialog: 1h/8h/24h/7d/custom) → PDF with history trend chart + data table (reportlab + matplotlib)
- Bit Alarm & Word Alarm definitions (group, conditions ON/OFF, high/low/equal/range, record, not-save-when-off, beep/beep once, alarm screen popup/popup once, content text or Text Library)

## Implemented — Iteration 4: Versi Lokal / On-Premise (2026-06)
- New drivers (backend/plc_ext.py): Omron Host Link (serial), Fatek FBs (TCP/serial), S7-1200/1500 symbolic via OPC UA (asyncua), Wecon D/M/X/Y→Modbus mapping; Omron FINS UDP, S7-200 TSAP, Modbus RTU RS485/232/422
- Engine: shared driver per device with lock (poll/write/test), auto-reconnect with configurable interval, status online/reconnecting/error, tag quality good/bad (last value kept), stats (ok/fail/rtt/avg/attempts), Indonesian error messages
- API: /api/system/serial-ports, /api/system/info, test koneksi reads first tag; TIA import for symbolic devices with DB prefix
- UI: protocol-specific device form, COM port detection, device cards with status colours + stats + inline test result, BAD/OFFLINE tag chip, runtime warning badge, local LAN address card (local mode)
- Local packaging: local/launcher.py (bundled mongod + uvicorn serving API + SPA on :8080, COOKIE_SECURE=false, local disk file storage), installer.iss (Inno Setup: firewall, autostart task, shortcuts), build_windows.ps1, GitHub Actions workflow .github/workflows/windows-installer.yml
- Virtual PLC simulators: backend/tests/virtual_plcs.py (Modbus, Fatek, FINS UDP, S7, OPC UA, Host Link pty)

## Backlog
- Fase 2: backup/restore project to file, export/import project between PCs, auto cleanup of old data records, raw-frame communication log page
- Fase 3: Edge Gateway hybrid (cloud app + local agent with offline buffer), remote runtime access
- P2: Scripts/expressions on tags, recipe management, WebSocket push
