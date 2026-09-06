import assert from "node:assert/strict";
import { parseRegistrationInput } from "../src/features/auth/server/register";
import { apiErrorResponse } from "../src/lib/api-errors";
import { ServiceError } from "../src/lib/service-error";

const registration = parseRegistrationInput({
  username: "  测试用户  ",
  password: "correct-horse-battery",
  confirmPassword: "correct-horse-battery",
  securityQuestion: "__custom__",
  customQuestion: "我的恢复提示？",
  securityAnswer: "  答案  ",
});
assert.equal(registration.username, "测试用户");
assert.equal(registration.securityAnswer, "答案");
assert.throws(() => parseRegistrationInput([]), /注册数据格式错误/);
assert.throws(() => parseRegistrationInput({ ...registration, confirmPassword: "different" }), /两次密码不一致/);

async function verifyErrorContract(): Promise<void> {
  const response = apiErrorResponse(
    new ServiceError("TOO_MANY_REQUESTS", "请稍后重试", { retryAfterSeconds: 7 }),
    { request: new Request("http://localhost/test", { headers: { "x-request-id": "test-request-1234" } }), useCase: "contract.test", startedAt: Date.now() },
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "7");
  assert.equal(response.headers.get("x-request-id"), "test-request-1234");
  assert.deepEqual(await response.json(), {
    error: "请稍后重试",
    code: "TOO_MANY_REQUESTS",
    requestId: "test-request-1234",
    details: { retryAfterSeconds: 7 },
  });
}

verifyErrorContract().then(() => console.log("API and use-case contract tests passed.")).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});