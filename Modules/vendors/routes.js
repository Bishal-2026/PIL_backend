const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

// Vendors are system-wide; keep superadmin-only
// Public: used during app registration to verify vendorCode before login
router.get("/public/verify", Controller.verifyPublic);
router.post("/public/register", Controller.register);
router.post("/public/verify-otp", Controller.verifyOtp);

router.get("/", verifyToken, checkAuthorization(["superadmin"], "vendors"), Controller.getAll);
router.get("/:id", verifyToken, checkAuthorization(["superadmin"], "vendors"), Controller.getById);
router.post("/", verifyToken, checkAuthorization(["superadmin"], "vendors"), Controller.add);
router.put("/:id", verifyToken, checkAuthorization(["superadmin"], "vendors"), Controller.update);
router.delete("/:id", verifyToken, checkAuthorization(["superadmin"], "vendors"), Controller.remove);

module.exports = router;
