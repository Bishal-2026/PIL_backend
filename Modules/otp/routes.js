const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");

const requireSuperadmin = (req, res, next) => {
  if (req.user?.role === "superadmin") return next();
  return res.status(403).json({ status: "error", message: "Forbidden: superadmin only" });
};

router.post("/send-otp", Controller.sendOtp);
router.post("/verify-otp", Controller.verifyOtp);
router.post("/otp-email", verifyToken, requireSuperadmin, Controller.setOtpEmail);
router.get("/otp-email", verifyToken, requireSuperadmin, Controller.getOtpEmail);

module.exports = router;
