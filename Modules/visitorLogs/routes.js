const express = require("express");
const router = express.Router();
const controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");

// Public route for visitor registration (might need security like QR code or Kiosk mode)
router.post("/register", controller.register);

// Protected routes
router.get("/", verifyToken, controller.getAll);
router.get("/stats", verifyToken, controller.getStats);
router.get("/:id", verifyToken, controller.getById);
router.patch("/:id/status", verifyToken, controller.updateStatus);

module.exports = router;
