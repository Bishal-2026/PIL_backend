const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");
const { upload } = require("../../middleware/upload");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor"];

router.post(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "visitors"),
  upload.single("profileImage"),
  Controller.add
);

router.get(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "visitors"),
  Controller.getAll
);

router.get(
  "/all",
  verifyToken,
  checkAuthorization(allRoles, "visitors"),
  Controller.getAll
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(allRoles, "visitors"),
  Controller.getAll
);

router.get(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "visitors"),
  Controller.getById
);

router.put(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "visitors"),
  upload.single("profileImage"),
  Controller.update
);

router.put(
  "/:id/session-status",
  verifyToken,
  checkAuthorization(["admin", "hr", "superadmin"], "visitors", "read"),
  Controller.updateSessionStatus
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "visitors"),
  Controller.remove
);

module.exports = router;
