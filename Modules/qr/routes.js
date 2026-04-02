const express = require("express");
const router = express.Router();
const { generateQr, generateQrPng, generateStaticQrPng, consumeQr, getOfflineSecret } = require("./controller");
const verifyToken = require("../../middleware/verifyToken");

// QR generate requires logged-in user to resolve location
router.post("/generate", verifyToken, generateQr);
router.post("/generate-png", verifyToken, generateQrPng);
router.get("/static-png", generateStaticQrPng);
router.post("/consume", consumeQr);
router.get("/offline-secret", verifyToken, getOfflineSecret);

module.exports = router;
