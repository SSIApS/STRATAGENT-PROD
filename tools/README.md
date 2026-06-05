# STRATAGENT — Diagnostic Tools

Run all scripts from the `stratagent/backend` directory or from `stratagent/tools/` directly.

| Script | Purpose | Run from |
|--------|---------|----------|
| `list_kbs.py` | List all Knowledge Bases with ID, name, depth, doc count | `stratagent/tools/` |
| `set_seeds.py` | Write Manual Seeds for MissBlue and STRATATIV3D directly to Firestore | `stratagent/tools/` |
| `add_web_sources.py` | Bulk-add web sources to a KB | `stratagent/tools/` |
| `rename_isode_kb.py` | One-time rename script for ISODE KB | `stratagent/tools/` |
| `delete_duplicate_ssi.py` | One-time dedup script for SSI Consult KB | `stratagent/tools/` |

**Note:** The app does not need to be running. Scripts write directly to Firestore via the backend service.
