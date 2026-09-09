# RapidOCR 单图预览服务

当前交付：`/health`、`/ocr` 原始坐标/文本、`/recognize` 的 DATA「数据—双方」实验性解析，以及独立 Bash / PM2 后台管理入口。

**尚未完成六图正式识别。不要把这个预览服务配置为生产 MATCH_OCR_ENDPOINT。** 网站要求 DATA、OUTPUT、SURVIVAL、DEVELOPMENT、KDA、TEAM 六页；本服务只接受一张，其他类型仅可用 `/ocr` 导出原始文字。六图请求会被拒绝，不会伪造五页结果或 PASS 状态。`/health` 返回 `fullMatchReady: false`。

## 环境与源码

先把本次服务代码同步到目标机器的仓库，再运行下面的命令。仅安装 pip 包不会创建这些文件。

已有 OCR 环境时，在仓库中直接执行 `bash scripts/deploy.sh --ocr --check` 即可。
脚本自动按顺序尝试：项目 `.venv-ocr/bin/python`、已激活的 `VIRTUAL_ENV/bin/python`、
`/opt/runtime/Python/python/bin/python`、`/opt/runtime/python/bin/python`、PATH 中的 `python3` 和 `python`。
每个候选都验证实际 OCR 依赖导入，跳过缺包或 cv2 系统库不可用的环境，并打印最终选中的路径。
若显式设置了 `OCR_PYTHON`，则严格使用该路径，错误时不悄悄切换。
此脚本不读取网站 `.env`，不会自动安装依赖，也不改变目录权限。
后台启动默认使用仓库旁的 `<仓库路径>-ocr.token`，例如 `/opt/project/wzywt-ocr.token`，无需 export。
下面的 `export OCR_PYTHON=...` 是可选的明确指定方式；直接运行 Python 管理命令时仍需设置它。

虚拟机：

```bash
cd /opt/wzywt
export OCR_PYTHON=/opt/wzywt/.venv-ocr/bin/python
export OCR_TOKEN_FILE=/opt/wzywt-ocr.token
```

云服务器（使用现有环境；后台进程由仓库所属 project 用户管理）：

```bash
cd /opt/project/wzywt
export OCR_PYTHON=/opt/runtime/Python/python/bin/python
export OCR_TOKEN_FILE=/opt/project/wzywt-ocr.token
```

路径按实际安装位置配置，不假设两台机器相同。以上环境变量只用于显式覆盖和手动 probe，常规后台启动无需设置。

已完成依赖安装的机器无需重复安装。全新环境参考已验证版本：

```bash
"$OCR_PYTHON" -m pip install rapidocr==3.9.2 onnxruntime==1.29.0
"$OCR_PYTHON" -m pip install -r services/ocr/requirements-http.txt
"$OCR_PYTHON" -m pip uninstall -y opencv-python
"$OCR_PYTHON" -m pip install opencv-python-headless
```

仅在专用 OCR 环境中替换 OpenCV。RapidOCR 的包元数据仍声明 `opencv-python`，所以替换 headless 后 `pip check` 可能报告缺少该声明依赖；这是元数据差异，不应重新共装两个 cv2 包。后续更新 RapidOCR 可能重新拉入 GUI 版，需要重新检查。依赖版本来自本次安装，HTTP 依赖文件不是完整跨平台 lockfile。

## 一条命令后台启动（虚拟机和云服务器通用）

```bash
# 在持久化源码仓库目录执行。云服务器 /opt/project/wzywt；虚拟机 /opt/wzywt。
bash scripts/deploy.sh --ocr
```

默认等同于 `--ocr --start`，不再默认为只检查。脚本依次选择 Python、检查仓库所属用户、创建或复用令牌、管理独立 `wzywt-ocr` PM2 进程、等待健康检查、成功后 `pm2 save`。重复运行会重启并更新同一个 OCR 进程，不创建副本；不重启 Web/cron。

- root 在 project 所属仓库执行时：仅对默认的、无符号链接且无其他硬链接的 root 所有令牌修正归属，然后通过 `runuser` 切换到 project。不会把服务启动到 root 的 PM2，也不递归 chown 项目。虚拟机仓库属于 root 时仍使用 root。
- project 遇到之前 root 创建的不可读令牌时：非特权用户无法自行改属主，脚本明确提示在 root 终端执行一次同样的 `bash scripts/deploy.sh --ocr`，由该命令完成修复和用户切换。无需手工执行 chown。
- 令牌缺失自动生成，已有有效令牌原样复用，权限收紧到 600；无效文件报错，不自动轮换。自定义 `OCR_TOKEN_FILE` 的既有错误归属需要管理员处理，脚本不对任意路径自动 chown。`init-token` 手动命令也可重复执行。
- PM2 默认使用运行用户的 home/.pm2（云服务器是 `/opt/project/.pm2`），支持 `OCR_PM2_HOME` 明确覆盖。非 root 调用也兼容其 `PM2_HOME`；root 切换用户时不继承 root 的 `PM2_HOME`。自定义目录必须属于运行用户。
- 现有同名进程必须匹配当前服务目录、Python 和 Uvicorn 参数；不匹配即拒绝覆盖。端口 8010 被前台服务占用时，先在原窗口 Ctrl+C，再运行后台启动命令。
- 健康检查核对服务标识、本次启动的 instanceId 以及 PM2/Python PID，最长等待约 90 秒。失败不执行 `pm2 save`，保留 OCR 条目供诊断。更新失败不保证恢复上一版 OCR，但不会改动网站进程。
- 健康成功后自动保存 PM2 列表，关闭 SSH 不影响服务。**开机恢复仍依赖已有的 PM2 startup 系统服务**，脚本不会自动安装/修改系统服务。参见 [PM2 开机恢复说明](https://pm2.keymetrics.io/docs/usage/startup/)。

后台 OCR 使用持久化源码中的 `services/ocr`；不能从 `wzywt-runtime/current` 或 release 内启动，否则可能随网站旧版本清理而失去文件。更新源码后再次运行 `--ocr` 生效。原来的 `bash scripts/deploy.sh` 仍然只发布网站，不连带更新 OCR。

## 检查、状态和日志

```bash
bash scripts/deploy.sh --ocr --check   # 检查依赖、模型和已有令牌；不创建令牌、不启动服务
bash scripts/deploy.sh --ocr --status  # 仅报告 OCR 状态并核对 HTTP health
bash scripts/deploy.sh --ocr --logs    # 输出 OCR 最近 50 行日志后退出
bash scripts/deploy.sh --ocr --start   # 首次后台启动，或更新已有 OCR 进程
bash scripts/deploy.sh --ocr --serve   # 可选前台调试；后台服务运行时不要同时启动
```

首次模型加载可能需要联网。`--check` 对不存在的令牌提示将在启动时创建；已有令牌不可读则检查失败。`--serve` 同样自动准备令牌，Ctrl+C 停止。服务只监听 `127.0.0.1:8010`，无需开放公网端口。

需要手动测试图片时，先按前面的虚拟机/云服务器示例设置 OCR_PYTHON 和 OCR_TOKEN_FILE：

```bash
curl --fail http://127.0.0.1:8010/health
"$OCR_PYTHON" services/ocr/manage.py probe /绝对路径/王者截图.jpg --raw
"$OCR_PYTHON" services/ocr/manage.py probe /绝对路径/王者截图.jpg
```

`probe` 使用令牌文件并且只访问本机，不受 HTTP_PROXY 配置影响。原始结果保留原图像素坐标、每行文字及置信度，不含巨大的像素数组；结构化结果返回网站 `normalizeRecognitionPayload` 使用的 `pages[].players[].metrics` 格式，但仅含 DATA 一页，网站将正确判为六图不完整。

## 解析边界与验证

### 虚拟机的网站 OCR 地址配置

网站的生产构建仍使用 `NODE_ENV=production`。虚拟机测试时，在网站源码仓库的 `.env`
明确设置本地部署模式；OCR 地址校验与现有本地入口共用私有地址规则：

```dotenv
DEPLOY_ENVIRONMENT=local
MATCH_OCR_ENDPOINT=http://127.0.0.1:8010/recognize
```

`PUBLIC_ORIGIN` 仍填写浏览器实际访问的虚拟机地址（例如 `http://192.168.1.73:8001`，
替换为自己的 IP）；`MATCH_OCR_TOKEN` 必须与 OCR 服务的令牌一致。不要粘贴 Markdown 链接或公开令牌。
`127.0.0.1` 指网站进程所在机器，适用于网站与 OCR 在同一台虚拟机运行。

本地模式只允许 localhost、回环和私有 IP 的 HTTP OCR；公网主机仍需 HTTPS。
未设置 `DEPLOY_ENVIRONMENT` 或设置为 `production` 时，生产构建继续要求 HTTPS，
包括回环 OCR 地址。不要为了绕过检查将云服务器改为 local。

同步修复代码并修改 `.env` 后，执行 `bash scripts/deploy.sh --check`，通过后再执行
`bash scripts/deploy.sh` 发布网站，使代码和配置对 Web/cron 生效；只重启 OCR 不会更新网站校验。
此配置仅解决地址校验，不代表六图识别已完成：当前预览服务仍拒绝六图请求，
单图请使用前面的 `manage.py probe` 验证。

### 预览能力

- 当前固定模板对应已提供截图，宽高比 2.0–2.35；必须找到左右两组四列表头和十个昵称/评分槽位。截取、压缩、不同 UI 版本可能被拒绝，需要导出 boxes 校准。未用当前本地文件完成真实图片解析验收（用户的微信临时文件已经不可读）。
- 依据坐标归组，不依赖 txts 顺序；仅以图中左侧为 blue、右侧为 red 标记截图阵营，正式集成还需验证其与网站队伍的映射。
- 数值支持 `k`、`万`、`%`；百分数返回 0–100。`130.2k` 转成 130200 只是屏幕舍入值，不能恢复真实精确伤害。低置信度、缺失或多个候选返回 null，不补 0。
- 不识别英雄头像，不猜 heroId，不宣称昵称百分百正确；纯数字昵称目前可能被当作徽章而拒绝整页，需要补充样本。
- 仅本机监听，Bearer 鉴权在解析请求体前执行；请求体限 13 MiB、图片限 12 MiB / 1200 万像素，仅非动画 JPEG/PNG/WebP。只允许一个推理任务，同时请求返回 429；健康检查仍可响应。
- 上传限时 20 秒。ONNX 原生线程不能强制中断，客户端取消不会释放正在推理的锁。常驻上线前应补子进程硬超时、资源限制及管理员可见的任务故障处理。

本地测试（需 HTTP 依赖和 `httpx==0.28.1`，无需下载 OCR 模型）：

```bash
"$OCR_PYTHON" -m unittest discover -s services/ocr -p 'test_*.py' -v
OCR_TEST_PYTHON="$OCR_PYTHON" node scripts/test-ocr-contract.mjs
bash scripts/test-ocr-python.sh
```

测试以合成文字坐标验证归组、数值、漏项、HTTP 鉴权、上传限制和并发，并以模拟 PM2 验证重复启动、进程归属、端口冲突、健康失败不保存和 root 用户切换。测试不代表真实 OCR 准确率或云服务器已部署。

下一步需要其他五类截图的样本及原始 boxes，补模板和跨图人员对应回归后，再启用六图 /recognize。默认生产模式仍要求 HTTPS OCR 地址；HTTPS 代理和正式 OCR 发布回滚要另行验收。

实现参考：[FastAPI 模型生命周期](https://fastapi.tiangolo.com/advanced/events/)、[RapidOCR 输出格式](https://rapidai.github.io/RapidOCRDocs/main/install_usage/rapidocr/usage/)。
