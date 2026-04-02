// const express = require("express");
// const router = express.Router();
// const uploadController = require("./controller");
// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // Dynamic folder-based storage
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     const folder = req.params.folder;
//     const uploadPath = path.join(__dirname, "../../uploads", folder);
//     fs.mkdirSync(uploadPath, { recursive: true });
//     cb(null, uploadPath);
//   },
//   filename: (req, file, cb) => {
//     const uniqueName = `${Date.now()}-${file.originalname}`;
//     cb(null, uniqueName);
//   },
// });

// const upload = multer({ storage });

// router.post("/:folder", upload.single("file"), uploadController.upload);
// router.get("/:folder/:filename", uploadController.getFile);

// module.exports = router;


const express = require("express");
const router = express.Router();
const uploadController = require("./controller");
const { upload } = require("./middleware");

// ✅ Routes
router.post("/", upload.single("file"), uploadController.upload);
router.post("/:folder", upload.single("file"), uploadController.upload);
router.get("/:folder/:filename", uploadController.getFile);

module.exports = router;
