# RapidOCR 单图预览服务

当前交付：`/health`、`/ocr` 原始坐标/文本、`/recognize` 的 DATA「数据—双方」实验性解析，以及独立 Bash 启动入口。

**尚未完成六图正式识别。不要把这个预览服务配置为生产 MATCH_OCR_ENDPOINT。** 网站要求 DATA、OUTPUT、SURVIVAL、DEVELOPMENT、KDA、TEAM 六页；本服务只接受一张，其他类型仅可用 `/ocr` 导出原始文字。六图请求会被拒绝，不会伪造五页结果或 PASS 状态。`/health` 返回 `fullMatchReady: false`。

## 环境与源码

先把本次服务代码同步到目标机器的仓库，再运行下面的命令。仅安装 pip 包不会创建这些文件。

已有 OCR 环境时，在仓库中直接执行 `bash scripts/deploy.sh --ocr --check` 即可。
脚本自动按顺序尝试：项目 `.venv-ocr/bin/python`、已激活的 `VIRTUAL_ENV/bin/python`、
`/opt/runtime/Python/python/bin/python`、`/opt/runtime/python/bin/python`、PATH 中的 `python3` 和 `python`。
每个候选都验证实际 OCR 依赖导入，跳过缺包或 cv2 系统库不可用的环境，并打印最终选中的路径。
若显式设置了 `OCR_PYTHON`，则严格使用该路径，错误时不悄悄切换。
此脚本不读取网站 `.env`，不会自动安装依赖，也不改变目录权限。
下面的 `export OCR_PYTHON=...` 是可选的明确指定方式；直接运行 Python 管理命令时仍需设置它。

虚拟机：

```bash
cd /opt/wzywt
export OCR_PYTHON=/opt/wzywt/.venv-ocr/bin/python
export OCR_TOKEN_FILE=/opt/wzywt-ocr.token
```

云服务器（测试时使用现有环境；未来常驻应由网站所属 project 用户管理）：

```bash
cd /opt/project/wzywt
export OCR_PYTHON=/opt/runtime/Python/python/bin/python
export OCR_TOKEN_FILE=/opt/project/wzywt-ocr.token
```

路径按实际安装位置配置，不假设两台机器相同。令牌文件必须由运行 OCR 的用户创建和读取。不要用 root 创建后直接让 project 读取 0600 文件。

已完成依赖安装的机器无需重复安装。全新环境参考已验证版本：

```bash
"$OCR_PYTHON" -m pip install rapidocr==3.9.2 onnxruntime==1.29.0
"$OCR_PYTHON" -m pip install -r services/ocr/requirements-http.txt
"$OCR_PYTHON" -m pip uninstall -y opencv-python
"$OCR_PYTHON" -m pip install opencv-python-headless
```

仅在专用 OCR 环境中替换 OpenCV。RapidOCR 的包元数据仍声明 `opencv-python`，所以替换 headless 后 `pip check` 可能报告缺少该声明依赖；这是元数据差异，不应重新共装两个 cv2 包。后续更新 RapidOCR 可能重新拉入 GUI 版，需要重新检查。依赖版本来自本次安装，HTTP 依赖文件不是完整跨平台 lockfile。

## Bash 启动

```bash
bash scripts/deploy.sh --ocr --check
"$OCR_PYTHON" services/ocr/manage.py init-token "$OCR_TOKEN_FILE"
bash scripts/deploy.sh --ocr --serve
```

`init-token` 只执行一次，文件已存在时拒绝覆盖；之后直接复用它。密钥不打印、不进入命令行参数。`--check` 检查导入并加载模型，但不启动服务；首次加载可能需要联网下载模型。`--serve` 前台运行，Ctrl+C 停止，只监听 `127.0.0.1:8010`。该入口不运行网站备份、migration、PM2、release 切换。原来的 `bash scripts/deploy.sh` 仍然只发布网站。

在同一台机器的另一个 SSH 窗口重新设置上述三个路径后：

```bash
curl --fail http://127.0.0.1:8010/health
"$OCR_PYTHON" services/ocr/manage.py probe /绝对路径/王者截图.jpg --raw
"$OCR_PYTHON" services/ocr/manage.py probe /绝对路径/王者截图.jpg
```

`probe` 使用令牌文件并且只访问本机，不受 HTTP_PROXY 配置影响。原始结果保留原图像素坐标、每行文字及置信度，不含巨大的像素数组；结构化结果返回网站 `normalizeRecognitionPayload` 使用的 `pages[].players[].metrics` 格式，但仅含 DATA 一页，网站将正确判为六图不完整。

## 解析边界与验证

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

测试以合成文字坐标验证归组、数值、漏项、HTTP 鉴权、上传限制和并发，不代表真实 OCR 准确率。

下一步需要其他五类截图的样本及原始 boxes，补模板和跨图人员对应回归后，再启用六图 /recognize。生产网站目前要求 HTTPS OCR 地址，预览阶段没有修改该检查；常驻发布的用户、服务目录、HTTPS 代理和回滚要另行验收。

实现参考：[FastAPI 模型生命周期](https://fastapi.tiangolo.com/advanced/events/)、[RapidOCR 输出格式](https://rapidai.github.io/RapidOCRDocs/main/install_usage/rapidocr/usage/)。
