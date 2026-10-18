# 视频测试样例

combat-video.mp4 是项目自行生成的 20 秒、320×180 H.264/AAC 测试图与正弦音，无第三方素材。用于上传、Range 播放、跳转到第 10 秒与重试回归。五分钟边界由 combat-video-streaming-regression.mjs 单独验证。

重建（需要本机 FFmpeg）：

```sh
ffmpeg -f lavfi -i testsrc2=size=320x180:rate=2 -f lavfi -i sine=frequency=440:sample_rate=22050 -t 20 -c:v libx264 -preset veryslow -crf 35 -pix_fmt yuv420p -c:a aac -b:a 24k -movflags +faststart tests/fixtures/combat-video.mp4
```
