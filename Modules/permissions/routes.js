const express = require("express");
const router = express.Router();
const permissionscontroller = require("./controller.js");
const verifyToken = require("../../middleware/verifyToken.js");
const checkAuthorization = require("../../middleware/checkAuthorization.js");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor", "teacher"];

router.get(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "permissions"),
  permissionscontroller.getAll
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(allRoles, "permissions"),
  permissionscontroller.search
);

router.get(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "permissions"),
  permissionscontroller.getbyid
);

router.post(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "permissions"),
  permissionscontroller.add
);

router.put(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "permissions"),
  permissionscontroller.update
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "permissions"),
  permissionscontroller.delete
);

router.post(
  "/delete",
  verifyToken,
  checkAuthorization(allRoles, "permissions"),
  permissionscontroller.delete
);

// Rebuild permissions.json based on DB roles
router.post(
  "/system",
  verifyToken,
  checkAuthorization(["superadmin"], "permissions"),
  permissionscontroller.FileCreate
);

module.exports = router;
