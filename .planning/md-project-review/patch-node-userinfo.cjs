const os = require("node:os");

// Node 26 在当前 Windows 沙箱内调用 uv_os_get_passwd 会错误返回 ENOMEM。
os.userInfo = () => ({
  uid: -1,
  gid: -1,
  username: process.env.USERNAME || "codex",
  homedir: process.env.USERPROFILE || process.cwd(),
  shell: null,
});
