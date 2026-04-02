const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");
const { upload } = require("../../middleware/upload");

const readRoles = ["admin", "superadmin", "hr", "manager"];
const writeRoles = ["admin", "superadmin"];

router.get("/", verifyToken, checkAuthorization(readRoles, "settings"), Controller.get);
router.put(
  "/",
  verifyToken,
  checkAuthorization(writeRoles, "settings"),
  upload.fields([
    { name: "apkFile", maxCount: 1 },
    { name: "companyLogo", maxCount: 1 },
  ]),
  Controller.update
);

module.exports = router;
