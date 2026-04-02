require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../Modules/user/model");

const MONGO_URI = process.env.MONGO_URI || "";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
const escapeRegExp = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const maskMongoUri = (uri) => {
  try {
    const u = new URL(uri);
    if (u.password) u.password = "***";
    return u.toString();
  } catch (_e) {
    return uri ? uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@") : "";
  }
};

const main = async () => {
  const emailArg = process.argv[2];
  const email = normalizeEmail(emailArg || process.env.EMAIL || "");
  if (!email) {
    throw new Error("Usage: node backend/scripts/check_user_email.js <email>");
  }
  if (!MONGO_URI) {
    throw new Error("MONGO_URI missing in env");
  }

  console.log("DB:", maskMongoUri(MONGO_URI));
  await mongoose.connect(MONGO_URI);

  const exact = await User.findOne({ email })
    .select("_id email role employeeId name location vendorCode createdAt updatedAt")
    .lean();

  console.log("\nExact match:", exact || null);

  const regex = new RegExp(`^\\s*${escapeRegExp(email)}\\s*$`, "i");
  const fuzzy = await User.find({ email: { $regex: regex } })
    .select("_id email role employeeId name location vendorCode createdAt updatedAt")
    .limit(10)
    .lean();

  console.log("\nCase/space-insensitive matches:", fuzzy.length);
  if (fuzzy.length) {
    fuzzy.forEach((u) => console.log("-", u));
  }

  const contains = await User.find({
    email: { $regex: new RegExp(escapeRegExp(email), "i") },
  })
    .select("_id email role employeeId name")
    .limit(10)
    .lean();

  console.log("\nContains matches:", contains.length);
  if (contains.length) {
    contains.forEach((u) => console.log("-", u));
  }

  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error("❌ Check failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch (_e) {
    // ignore
  }
  process.exit(1);
});

