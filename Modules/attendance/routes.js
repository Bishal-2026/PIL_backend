const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

// Roles that can access attendance module (method-level access is enforced by permissions.json)
const attendanceRoles = ["admin", "superadmin", "hr", "manager", "supervisor"];

router.post(
  "/",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.add
);

// Alias for /attendance/add
router.post(
  "/add",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.add
);

router.get(
  "/",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.getAll
);

router.get(
  "/all",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.getAll
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.getAll
);

router.get(
  "/not-logged-in",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.getNotLoggedIn
);

router.get(
  "/:id",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.getbyid
);

router.put(
  "/:id",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.update
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.delete
);

router.post(
  "/delete",
  verifyToken,
  checkAuthorization(attendanceRoles, "attendance"),
  Controller.delete
);

module.exports = router;
