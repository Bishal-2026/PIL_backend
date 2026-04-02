const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor", "teacher"];

router.post(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "rfid"),
  Controller.add
);

router.get(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "rfid"),
  Controller.getAll
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(allRoles, "rfid"),
  Controller.getAll
);

router.get(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "rfid"),
  Controller.getbyid
);

router.put(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "rfid"),
  Controller.update
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "rfid"),
  Controller.delete
);

router.post(
  "/delete",
  verifyToken,
  checkAuthorization(allRoles, "rfid"),
  Controller.delete
);

module.exports = router;
