const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor", "teacher"];

router.post(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "sections"),
  Controller.add
);

router.get(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "sections"),
  Controller.getAll
);

// convenience list without pagination
router.get(
  "/all",
  verifyToken,
  checkAuthorization(allRoles, "sections"),
  Controller.getList
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(allRoles, "sections"),
  Controller.getAll
);

router.get(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "sections"),
  Controller.getbyid
);

router.put(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "sections"),
  Controller.update
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "sections"),
  Controller.delete
);

router.post(
  "/delete",
  verifyToken,
  checkAuthorization(allRoles, "sections"),
  Controller.delete
);

module.exports = router;
