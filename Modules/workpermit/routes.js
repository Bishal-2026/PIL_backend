const express = require("express");
const router = express.Router();
const controller = require("./controller");

router.get("/get-options", controller.getOptions);
router.get("/all", controller.getAll);
router.get("/public", controller.getPublic);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.patch("/:id/status", controller.updateStatus);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
