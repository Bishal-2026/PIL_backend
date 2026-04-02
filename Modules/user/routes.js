const express = require("express");
const router = express.Router();
const {
  registerUser,
  loginUser,
  qrLoginUser,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  getAll,
  getbyid,
  update,
  remove,
} = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/qr-login", qrLoginUser);
router.post("/forgot-password", forgotPassword);
router.post("/verify-otp", verifyResetOtp);
router.post("/reset-password", resetPassword);

// CRUD routes for System Users
router.get("/", verifyToken, checkAuthorization(["superadmin"], "user", "read"), getAll);
router.get("/search", verifyToken, checkAuthorization(["superadmin"], "user", "read"), getAll);
router.get("/:id", verifyToken, checkAuthorization(["superadmin"], "user", "read"), getbyid);
router.put("/:id", verifyToken, checkAuthorization(["superadmin"], "user", "update"), update);
router.delete("/:id", verifyToken, checkAuthorization(["superadmin"], "user", "delete"), remove);

module.exports = router;
