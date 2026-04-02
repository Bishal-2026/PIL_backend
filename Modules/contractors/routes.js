const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor", "teacher"];

router.post(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "contractors"),
  Controller.add
);

router.get(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "contractors"),
  Controller.getAll
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(allRoles, "contractors"),
  Controller.getAll
);

router.get(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "contractors"),
  Controller.getbyid
);

router.put(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "contractors"),
  Controller.update
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "contractors"),
  Controller.delete
);

router.post(
  "/delete",
  verifyToken,
  checkAuthorization(allRoles, "contractors"),
  Controller.delete
);

module.exports = router;
