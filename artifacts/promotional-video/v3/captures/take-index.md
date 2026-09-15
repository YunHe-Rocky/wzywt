# V3 real public-browser motion takes

All videos are silent H.264 / yuv420p / 30 fps. Desktop takes are 1920×1080. The mobile bonus is 1080×1920, rendered from a 432×768 logical mobile viewport at device scale 1.5 and scaled to final size.

These are actual Chromium screencast frames captured during real public-site interactions, not motion applied to still screenshots. All visits were logged out and read-only: no login, room creation, registration, profile changes, or form submissions. Search and filter controls only changed the displayed public list.

| File | Encoded duration | Actual content | Useful excerpts |
|---|---:|---|---|
| `A-home-and-three-steps.mp4` | 18.07 s | Homepage art and existing animation, hover over event-hall CTA, real scroll revealing the friend-match three-step strip, return scroll | 0–4 s hero/CTA; 4.1–9.1 s scroll; 11.6–14 s return |
| `A-home-focus.mp4` | 18.07 s | Cropped derivative of A, centered on the homepage hero and three steps; **not additional distinct footage** | Prefer this over uncropped A to minimize the empty-public-room area near the bottom |
| `B-hero-role-and-search.mp4` | 18.00 s | Hero catalog, actual 打野 role filter, scroll through filtered loaded portraits, type 赵云 in search, hover the result | 2.3–8.6 s filter and scrolling; 8.8–12.8 s search/result |
| `B2-zhaoyun-stats-and-skills.mp4` | 12.03 s | Real 赵云 detail, loaded hero art and skin thumbnails, smooth scroll through base stats and skill descriptions | 0–2.2 s detail/skins; 2.2–6 s scroll; 6–10 s readable skill text |
| `C-equipment-filter-and-passives.mp4` | 18.07 s | Equipment tier filter to 三级, physical-category filter, scroll through displayed stats/passives, search 无尽战刃 | 2–6 s filters; 6–10.5 s scroll and effects; 11.8–15.5 s search/result |
| `D-mobile-home.mp4` | 11.97 s | Public mobile homepage, actual scroll to the three-step strip and return, persistent mobile navigation | 0–2.5 s and 9.4–11.9 s are strongest hero/dock views; middle includes the real empty-public-room state |

Primary desktop footage totals 66.17 s. The mobile bonus adds 11.97 s; using its first and last ~2.5 seconds gives approximately 71 s of selected footage. A-focus is an alternate crop of A and must not be counted twice.

## Capture and verification notes

- Image-ready checks required each visible target image to be complete, have nonzero natural width, and have CSS opacity at least 0.99. Hero initial and filtered views were warmed before capture.
- Source frame counts: A 1006; B 1030; B2 681; C 999; D 593.
- B2 was opened by clicking the real 赵云 result after B ended. It starts after the detail finished loading. Cut between the two takes; this is not an uncut navigation recording.
- Equipment cards in the current public list have no detail-click control. The current equipment detail component also has no composition tree. No unsupported detail/composition workflow was staged or claimed.
- All five distinct MP4 files fully decoded without errors. Decoded contact sheets were inspected: hero portraits, detail thumbnails and equipment icons are visible, with no prolonged loading footage.
- Each named take folder contains first/last PNGs, a decoded contact sheet, evidence with event timestamps, the screencast source frames, and the FFmpeg timing list.
- The mobile high-DPI first attempt ended when the browser closed. The delivered second take completed at a lower capture scale and was verified.
