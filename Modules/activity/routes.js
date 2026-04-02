const express = require("express");
const router = express.Router();
const Controller = require("./controller");
const verifyToken = require("../../middleware/verifyToken");
const checkAuthorization = require("../../middleware/checkAuthorization");

const allRoles = ["admin", "hr", "supervisor", "employee", "manager", "superadmin", "contractor", "teacher"];

router.post(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "activity"),
  Controller.add
);

router.get(
  "/",
  verifyToken,
  checkAuthorization(allRoles, "activity"),
  Controller.getAll
);

// Dashboard summary counts
router.get(
  "/summary",
  verifyToken,
  checkAuthorization(allRoles, "activity"),
  Controller.getSummary
);

router.get(
  "/search",
  verifyToken,
  checkAuthorization(allRoles, "activity"),
  Controller.getAll
);

	router.get(
	  "/notifications",
	  verifyToken,
	  checkAuthorization(allRoles, "activity"),
	  Controller.getNotifications
	);

	router.delete(
	  "/notifications",
	  verifyToken,
	  checkAuthorization(allRoles, "activity"),
	  Controller.clearNotifications
	);

	router.delete(
	  "/notifications/:id",
	  verifyToken,
	  checkAuthorization(allRoles, "activity"),
	  Controller.deleteNotification
	);

router.get(
  "/notifications/unread-count",
  verifyToken,
  checkAuthorization(allRoles, "activity"),
  Controller.getNotificationCount
);

router.post(
  "/notifications/mark-read",
  verifyToken,
  checkAuthorization(allRoles, "activity", "read"),
  Controller.markNotificationsRead
);

router.get(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "activity"),
  Controller.getById
);

router.delete(
  "/:id",
  verifyToken,
  checkAuthorization(allRoles, "activity"),
  Controller.deleteMany
);

router.post(
  "/delete",
  verifyToken,
  checkAuthorization(allRoles, "activity"),
  Controller.deleteMany
);

module.exports = router;
