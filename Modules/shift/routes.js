const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor", "teacher"];

router.post(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "shift"),
  Controller.add
);

router.get(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "shift"),
  Controller.getAll
);

router.get(
  "/all",
  verifyToken,
  checkAuthorization(allRoles, "shift"),
  Controller.getList
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(allRoles, "shift"),
  Controller.getAll
);

router.get(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "shift"),
  Controller.getbyid
);

router.put(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "shift"),
  Controller.update
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "shift"),
  Controller.delete
);

router.post(
  "/delete",
  verifyToken,
  checkAuthorization(allRoles, "shift"),
  Controller.delete
);

module.exports = router;
