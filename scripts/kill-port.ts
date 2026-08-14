// 启动前只检测端口，不终止来源不明的用户进程。
import { createServer } from "node:net";

const PORT = 8001;

const server = createServer();
server.unref();
server.once("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(`[port-check] 端口 ${PORT} 已被占用；请确认进程归属后手动处理`);
    process.exitCode = 1;
    return;
  }
  console.error(`[port-check] 端口 ${PORT} 检查失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, () => {
  server.close(() => console.log(`[port-check] 端口 ${PORT} 就绪`));
});
