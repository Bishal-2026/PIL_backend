const mongoose = require("mongoose");
const { ajModel } = require("../../common/classes/Model");

const machineSchema = {
  machineId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  zone: { type: String, required: true },
  line: { type: String, required: true },
  status: { type: String, enum: ["Operational", "Issue Active"], default: "Operational" },
  activeTicket: { type: mongoose.Schema.Types.ObjectId, ref: "MaintenanceTicket", default: null }
};

const ticketSchema = {
  ticketId: { type: String, required: true, unique: true },
  machine: { type: mongoose.Schema.Types.ObjectId, ref: "Machine", required: true },
  machineName: { type: String },
  zone: { type: String },
  line: { type: String },
  reason: { type: String, required: true },
  description: { type: String },
  raisedBy: { type: String, required: true },
  raisedAt: { type: Date, default: Date.now },
  status: { 
    type: String, 
    enum: ["Pending", "Assigned", "In Progress", "Resolved", "OTP Verified"], 
    default: "Pending" 
  },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  assignedName: { type: String },
  resolvedAt: { type: Date, default: null },
  otp: { type: String },
  otpVerified: { type: Boolean, default: false },
  priority: { 
    type: String, 
    enum: ["Critical", "High", "Medium", "Low"], 
    default: "Medium" 
  },
  downtime: { type: String, default: "Running…" },
  remark: { type: String, default: "" }
};

const machineModel = new ajModel("Machine", machineSchema);
const ticketModel = new ajModel("MaintenanceTicket", ticketSchema);

module.exports = {
  Machine: machineModel.getModel(),
  MaintenanceTicket: ticketModel.getModel()
};
