# Workspace video fixture

`workspace-video.mp4` is a two-second, silent, synthetic 640×360 H.264 clip.
It contains a green background and the visible labels `TEST FIXTURE` and
`本地复盘测试画面 · 非游戏录像`. No production footage or personal data is used.
It is bundled for isolated browser tests; product code never references it.

Generated with existing FFmpeg 7.1 (`libx264`, `yuv420p`, 12 fps, CRF 30,
`+faststart`), a `color=c=0x293d34:s=640x360:d=2:r=12` source and two `drawtext`
labels using Windows Microsoft YaHei. Regeneration is optional: the committed
small fixture lets the suite run without FFmpeg or the local tooling path.
