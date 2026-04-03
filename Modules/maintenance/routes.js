const express = require("express");
const router = express.Router();
const controller = require("./controller");

// Machines
router.get("/machines", controller.getMachines);
router.post("/machines", controller.addMachine);

// Tickets
router.get("/tickets", controller.getTickets);
router.post("/tickets", controller.createTicket);
router.put("/tickets/:id", controller.updateTicket);
router.post("/tickets/assign", controller.assignTicket);
router.post("/tickets/verify-otp", controller.verifyOTP);

// Technicians
router.get("/technicians", controller.getTechnicians);
router.get("/tasks/:technicianId", controller.getTasksByTechnician);

module.exports = router;
