const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor", "teacher"];

router.get(
  "/summary",
  verifyToken,
  checkAuthorization(allRoles, "dashboard"),
  Controller.getSummary
);

module.exports = router;
