require("dotenv").config();
const nodemailer = require("nodemailer");

const boolFromEnv = (value) => String(value || "").trim().toLowerCase() === "true";

const main = async () => {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = boolFromEnv(process.env.SMTP_SECURE);
  const user = String(process.env.EMAIL_USER || "").trim();
  const pass = process.env.EMAIL_PASSWORD ?? "";
  const to = String(process.env.TEST_SMTP_TO || user).trim();

  if (!host || !user || !pass) {
    throw new Error("Missing SMTP_HOST / EMAIL_USER / EMAIL_PASSWORD in env");
  }

  console.log("SMTP config:", {
    host,
    port,
    secure,
    user,
    passLength: String(pass).length,
    passPreview: String(pass).slice(0, 1) ? `${String(pass).slice(0, 1)}***` : "",
    to,
  });

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  console.log("Verifying transporter...");
  await transporter.verify();
  console.log("✅ SMTP verify OK");

  console.log("Sending test email...");
  const info = await transporter.sendMail({
    from: `PIL Email <${user}>`,
    to,
    subject: "SMTP Test - InOut360",
    text: `SMTP test email sent at ${new Date().toISOString()}`,
  });
  console.log("✅ Sent:", { messageId: info.messageId, accepted: info.accepted });
};

main().catch((err) => {
  console.error("❌ SMTP test failed:", err?.message || err);
  process.exit(1);
});

