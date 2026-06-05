# STRATAGENT — Brand Reference
*Last updated: 2026-06-05 | Source file: Stratagent_Logo_Options_v1.pdf*

---

## Brand Statement

**STRATAGENT**  
Tagline: **THE INTELLIGENCE BEHIND AGENTIC SALES**

Design logic: "STRAT" is set in dark charcoal. "AGENT" carries the brand colour (blue or red). A small forward-arrow ► follows the wordmark — represents agentic forward motion.

---

## Colour Versions

Two approved colour palettes. Choose based on context and emotional register.

### v.1 — Blue (Primary / Default)
- **Feel:** Precision, intelligence, technology, trust
- **Use for:** App UI, standard outgoing reports, proposals, default digital use, business collateral
- STRAT: dark charcoal `#2d3033`
- AGENT: blue gradient — deep navy → electric blue `#0070c0` → cyan `#00b4d8`
- Arrow ►: matches blue

### v.2 — Red / Orange (Energy / Urgency)
- **Feel:** Energy, action, disruption, heat
- **Use for:** Campaign materials, event presence, high-impact first impressions, situations where you want to stand out on a crowded page
- STRAT: dark charcoal `#2d3033`
- AGENT: red/orange gradient — deep red → burnt orange → amber
- Arrow ►: matches red

---

## Logo Variants (by file location)

All source variants are in `Stratagent_Logo_Options_v1.pdf` (pages noted below).  
Export individual PNGs into the appropriate subfolder when received from designer.

| Variant | Version | Background | PDF Page | Folder |
|---------|---------|------------|----------|--------|
| Logo Solids (Stratativ Slash) | v.1 Blue | White | p.1 | `Logos/v1-Blue/` |
| Logo Gradient (Stratativ Slash) | v.1 Blue | White | p.1 | `Logos/v1-Blue/` |
| Logo Gradient (Stratativ Slash) | v.1 Blue | **Black (Reverse)** | p.1 | `Logos/v1-Blue/` |
| Logo Solids (Stratativ Slash) | v.2 Red | White | p.3 | `Logos/v2-Red/` |
| Logo Gradient (Stratativ Slash) | v.2 Red | White | p.3 | `Logos/v2-Red/` |
| Logo Gradient (Stratativ Slash) | v.2 Red | **Black (Reverse)** | p.3 | `Logos/v2-Red/` |
| Collateral mockups (jacket, cap, business card) | v.1 Blue | — | p.5 | `Collateral/` |

---

## Sub-Brand Lockups

Used when a specific agent is the focus. The STRATAGENT wordmark appears full-size, with the agent name below-right in matching colour, preceded by ►.

Pattern: **STRATAGENT►** over **►[AGENT NAME]**

| Agent | Status | PDF Page | Sub-Brand |
|-------|--------|----------|-----------|
| ►STRATALYST | ✅ Built | p.2 (v.1 Blue), p.4 (v.2 Red) | Yes — both versions |
| ►STRATASCOUT | 🔲 Planned | p.2 (v.1 Blue), p.4 (v.2 Red) | Yes — both versions |
| ►STRATEGIST | 🔲 Planned | p.2 (v.1 Blue), p.4 (v.2 Red) | Yes — both versions |
| STRATADAR | 🔲 Internal | — | **No** — background agent, not customer-facing |

Sub-brand files → save to `Sub-Brands/` when exported.
STRATADAR is the Active Watch monitor — runs internally, never appears in client outputs.

---

## Usage Guide — Which Variant for What

| Use Case | Recommended Variant |
|----------|---------------------|
| App UI / login screen | v.1 Blue, Gradient, on dark background (Reverse) |
| Outgoing proposals (CONVERGENCE PROPOSAL) | v.1 Blue, Gradient, on white header |
| Mutual Value Brief / First Signal | v.1 Blue, Solid or Gradient, on white |
| STRATALYST research reports | v.1 Blue + STRATALYST sub-brand |
| STRATEGIST Monday Brief | v.1 Blue + STRATEGIST sub-brand |
| Campaign / outbound marketing | v.2 Red, Gradient — high impact |
| Dark-background reports / covers | v.1 Blue Reverse OR v.2 Red Reverse |
| Email signature | v.1 Blue, Solid, on white |
| Apparel / physical collateral | v.1 Blue (embroidered — no gradient on fabric) |
| Business cards | v.1 Blue — light version or dark reverse version |

---

## Naming Convention (for exported files)

When individual PNGs/SVGs are received from the designer, name them:

```
stratagent-logo-[version]-[style]-[background]-[size].png

Examples:
stratagent-logo-v1-gradient-white-2x.png
stratagent-logo-v1-gradient-black-2x.png   ← for dark reports
stratagent-logo-v2-gradient-white-2x.png
stratagent-logo-v1-solid-white-2x.png
stratagent-sub-stratalyst-v1-white-2x.png
stratagent-sub-strategist-v1-white-2x.png
```

---

## Folder Structure

```
Marketing/
├── BRAND_REFERENCE.md          ← this file
├── Stratagent_Logo_Options_v1.pdf   ← full source PDF from designer
├── Logos/
│   ├── v1-Blue/                ← export blue variants here
│   └── v2-Red/                 ← export red variants here
├── Sub-Brands/                 ← agent sub-brand lockups
└── Collateral/                 ← mockups, business cards, apparel
```

---

## Notes for Output Engine / Report Generation

When the Output Engine generates proposals:
- **Default logo:** v.1 Blue Gradient on white (`Logos/v1-Blue/`)
- **Dark cover pages:** v.1 Blue Reverse on black (`Logos/v1-Blue/`)
- **Agent-specific reports:** use matching sub-brand lockup from `Sub-Brands/`
- Reference images by relative path from the Marketing folder
- PNG at 2× resolution preferred for print-quality PDF output

---

*To add new assets: drop exported files into the correct subfolder above, then update the table in the Variants section.*

---

## Need New or Different Assets?

If a required format or variant doesn't exist yet, see:
**`Marketing/Contacts/COLLABORATORS.md`** — Nate Carlson (designer) contact details, what he holds in source files, and a ready-to-use briefing template agents can fill in and flag to Jason.
