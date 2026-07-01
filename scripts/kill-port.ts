// 启动前检测并释放端口 8001
import { execSync } from "child_process";

const PORT = 8001;

try {
  // Windows: 找到占用端口的 PID 并杀掉
  const result = execSync(`netstat -ano | findstr LISTENING | findstr :${PORT}`, { encoding: "utf-8" });
  const lines = result.trim().split(/\r?\n/);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && pid !== "0") {
      try {
        execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        console.log(`[kill-port] 已释放端口 ${PORT} (PID ${pid})`);
      } catch {
        console.error(`[kill-port] 无法终止 PID ${pid}，请手动关闭`);
      }
    }
  }
} catch {
  // 没有进程占用该端口，正常
}

console.log(`[kill-port] 端口 ${PORT} 就绪`);
