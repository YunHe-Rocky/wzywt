/** Safe messages for persisted worker failures. Never display raw provider responses. */
const MESSAGES: Record<string, string> = {
  OCR_UPGRADE_REQUIRED: "识别服务仍是单图预览版，请管理员更新并重启独立 OCR 服务后重试；已上传截图可以继续使用。",
  OCR_INPUT_INVALID: "截图无法解析，请核对六类截图是否对应、是否为完整横屏双方视图，并替换模糊或裁剪的图片。",
  OCR_AUTH_FAILED: "网站与识别服务的令牌不一致，请管理员核对 OCR 配置后重试；无需重新上传截图。",
  OCR_IMAGE_TOO_LARGE: "截图超过识别服务大小限制，请将每张图片控制在 12 MiB 以内后重新上传。",
  OCR_BUSY: "识别服务正在处理其他任务，系统会稍后自动重试；若最终失败，可保留截图再次识别。",
  OCR_TIMEOUT: "识别耗时超过限制，请稍后重试；反复超时请管理员检查 OCR 服务负载。",
  OCR_UNAVAILABLE: "暂时无法连接识别服务，请管理员检查独立 OCR 服务是否运行、地址是否正确；已上传截图会保留。",
  SERVICE_UNAVAILABLE: "识别服务调用失败，请管理员检查服务状态、六图支持和令牌配置后重试；已上传截图会保留。",
  BUSINESS_VALIDATION_FAILED: "截图证据校验失败，请核对或重新上传六类截图后重试。",
  STALE_WORKER: "识别任务中断，请稍后重试；若反复发生，请管理员检查后台任务进程。",
};

export function recognitionFailureMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? "识别未完成，请重试；若仍失败，请管理员检查识别服务日志。";
}

export function isRetryableRecognitionFailure(code: string): boolean {
  return ["SERVICE_UNAVAILABLE", "RECOGNITION_FAILED", "OCR_UNAVAILABLE", "OCR_TIMEOUT", "OCR_BUSY"].includes(code);
}
