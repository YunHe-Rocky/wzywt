// Current Windows runtime reports ENOMEM from os.userInfo(); tsx only needs a stable temp-dir suffix.
if (typeof process.geteuid !== "function") {
  process.geteuid = () => 1000;
}
