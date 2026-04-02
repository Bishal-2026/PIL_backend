const express = require("express");
const router = express.Router();
const Controller = require("./controller");

router.post("/submit", Controller.submitDemoRequest);

module.exports = router;
