const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");
const { upload } = require("../../middleware/upload");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor"];

router.post(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  upload.single("profileImage"),
  Controller.add
);

// Alias for /employees/add
router.post(
  "/add",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  upload.single("profileImage"),
  Controller.add
);

router.get(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  Controller.getAll
);

router.get(
  "/all",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  Controller.getAll
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  Controller.getAll
);

	router.get(
	  "/indexes",
	  verifyToken,
	  checkAuthorization(allRoles, "employees"),
	  Controller.getIndexes
	);

	router.get(
	  "/overview/:employeeId",
	  verifyToken,
	  checkAuthorization(allRoles, "employees"),
	  Controller.getOverviewByEmployeeId
	);

router.post(
  "/cleanup-indexes",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  Controller.cleanupIndexes
);

// Temporary public maintenance routes (remove after cleanup)
router.get("/indexes/public", Controller.getIndexes);
router.post("/cleanup-indexes/public", Controller.cleanupIndexes);

	router.get(
	  "/:id",
	  verifyToken,
	  checkAuthorization(allRoles, "employees"),
	  Controller.getbyid
	);

router.put(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  upload.single("profileImage"),
  Controller.update
);

router.put(
  "/status",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  Controller.updateStatus
);

router.put(
  "/:id/session-status",
  verifyToken,
  checkAuthorization(["admin", "hr", "superadmin"], "employees", "read"),
  Controller.updateSessionStatus
);

router.put(
  "/:id/tags",
  verifyToken,
  checkAuthorization(["admin", "hr", "superadmin"], "employees"),
  Controller.updateTags
);

router.post(
  "/test-tag-notification",
  Controller.sendTaggedTestNotification
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  Controller.delete
);

router.post(
  "/delete",
  verifyToken,
  checkAuthorization(allRoles, "employees"),
  Controller.delete
);

module.exports = router;
