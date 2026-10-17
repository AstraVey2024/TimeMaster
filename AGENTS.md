# TimeMaster development guide

## Architecture
- This is a buildless, browser-local timeline editor. `dist/` contains editable source, not generated output.
- `dist/app.js` wires DOM, application state, local file operations and export dialogs.
- Pure modules cover layout, formatting, dates, import/report generation and image export geometry.
- `dist/versions.mjs` stores recoverable snapshots in IndexedDB. localStorage stores the active document.
- There are no runtime npm dependencies or backend APIs.

## Validation
- Run `npm test` or `node --test tests/*.test.mjs` after functional changes.
- DOM harness tests do not verify actual browser rendering, file pickers, downloads or PNG pixels. State browser verification limits accurately.
- Serve `dist/` over HTTP for manual checks, using `npm run dev`; do not use file://.

## Data integrity
- Never replace browser project data silently when changing defaults or storage schemas.
- New/open/import/restore actions must retain recoverable backups and enforce existing conflict checks.
- Preserve named TAG versions beyond undo operations; limit undo/automatic history to 50 entries.
- Treat imported JSON as untrusted; preserve date validation, duplicate detection and preview before applying.
- Explicit file save is separate from browser draft autosave. Do not claim a download was saved to disk with certainty.
- Keep project exports, screenshots, credentials and real business data out of this public repository.

## Product expectations
- Chinese UI; enterprise red/silver/white palette.
- Keep inline editing, floating formatting tools, group layers behind nodes, multi-selection and Ctrl/Cmd shortcuts working.
- Preserve PNG transparency/cropping and allocation limits, report filters, and note exclusion by default.
