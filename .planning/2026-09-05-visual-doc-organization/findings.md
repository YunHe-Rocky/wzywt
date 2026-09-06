# Findings

## Visual baseline

- The current match archive mixes uppercase English eyebrow labels, blue gradients, heavy rounded cards, status pills and a wide ten-column result table; this reads as a generic SaaS dashboard rather than a Chinese tournament record.
- The visual search suggested glassmorphism and gaming display fonts, but those outputs conflict with the repository's existing light editorial UI and would deepen the mismatch. Keep only its accessibility checklist, density target and restrained-motion guidance.
- The redesign should read like an official match sheet: one compact record header, a restrained workflow rail, a prominent result sheet, and contextual evidence/actions below it.
- On mobile, the match result needs a paired or stacked scorecard presentation instead of forcing the desktop table into an internal horizontal scroller.

## Documentation baseline

- `docs/` currently has twenty top-level files plus `themes/README.md`; stable categories are product, architecture/design, operations, roadmaps/task books, and reviews.
- Root has conventional project entries plus three long-lived planning documents. The latter belong under an isolated `.planning/<id>/` directory and can be removed from root without hiding project entry points.
- Existing local path references occur in README, AGENTS/CLAUDE, CONTRIBUTING, scripts, docs, and planning history. A move must update live repository references while preserving historical external GitHub links in the review evidence.


## Implemented direction

- The archive now uses a compact official-record header, split red/blue score, line-based five-step progress, numbered Chinese sections, underline tabs and restrained 10-12px radii instead of equal-weight glass cards and English SaaS kickers.
- Desktop retains a single semantic comparison table. At 768px and below, the same table rows become labeled player-record grids; inputs remain 44px high and 16px on mobile, while the panel no longer owns horizontal scrolling.
- Documentation categories are architecture, design, product, operations, roadmaps, and reviews, with docs/README.md as the only file at the documentation root.
- Root planning history moved intact to .planning/2026-09-05-v2-1-review-remediation/; the current isolated plan remains active.
