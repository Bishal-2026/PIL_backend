const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const resolveSubdir = (req, file) => {
  if (req?.params?.folder) return req.params.folder;
  if (file?.fieldname === "apkFile" || file?.fieldname === "companyLogo") {
    return "settings";
  }
  if (file?.fieldname === "profileImage") return "employees";

  const ext = path.extname(file?.originalname || "").toLowerCase();
  const mime = String(file?.mimetype || "").toLowerCase();
  const isApk = ext === ".apk" || mime === "application/vnd.android.package-archive";
  if (isApk) return "apk";
  if (mime.startsWith("image/")) return "image";
  if (ext && [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"].includes(ext)) {
    return "image";
  }

  return "other";
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subdir = resolveSubdir(req, file);
    const target = path.join(UPLOAD_ROOT, subdir);
    ensureDir(target);
    cb(null, target);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === "apkFile") {
    return cb(null, ext === ".apk");
  }
  if (file.fieldname === "companyLogo" || file.fieldname === "profileImage") {
    return cb(
      null,
      [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif"].includes(ext)
    );
  }
  if (req?.params?.folder) return cb(null, true);
  return cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

module.exports = { upload, UPLOAD_ROOT, resolveSubdir };
