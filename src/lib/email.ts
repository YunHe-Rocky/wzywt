import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.qq.com",
  port: parseInt(process.env.EMAIL_PORT || "465"),
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendVerificationEmail(
  to: string,
  code: string,
  type: "register" | "reset"
): Promise<{ success: boolean; error?: string }> {
  const subject = type === "register"
    ? "王者演武堂 - 邮箱验证码"
    : "王者演武堂 - 密码重置验证码";

  const html = `
<div style="max-width:480px;margin:0 auto;padding:32px;font-family:sans-serif">
  <h2 style="color:#c0a84a">王者演武堂</h2>
  <p>您的验证码为：</p>
  <div style="font-size:28px;font-weight:700;letter-spacing:4px;color:#c0a84a;padding:16px 0">${code}</div>
  <p style="color:#888">5分钟内有效，请勿泄露给他人。</p>
  ${type === "register" ? '<p style="color:#888">验证成功后即可完成注册。</p>' : '<p style="color:#888">如非本人操作，请忽略此邮件。</p>'}
</div>`;

  try {
    await transporter.sendMail({
      from: `"王者演武堂" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}
