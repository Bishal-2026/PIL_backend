const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");

router.post("/", Controller.create);
router.get("/", verifyToken, Controller.getAll);

module.exports = router;