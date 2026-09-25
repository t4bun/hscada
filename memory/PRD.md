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

## Backlog
- P1: User/operator login for published apps (roles), edge gateway agent for LAN PLCs behind NAT
- P1: Group select / align tools, widget templates/symbol library (pumps, valves, motors)
- P2: Scripts/expressions on tags, recipe management, report PDF export, WebSocket push, mobile layout per screen
