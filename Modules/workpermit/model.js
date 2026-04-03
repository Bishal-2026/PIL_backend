const mongoose = require("mongoose");
const { ajModel } = require("../../common/classes/Model");

const workPermitSchema = {
  permitId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  workType: { type: String, required: true },
  plant: { type: String },
  area: { type: String },
  location: { type: String },
  exactLocation: { type: String },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  requestedBy: { type: String, default: "Sandeep Kumar" },
  supervisor: { type: String },
  safetyOfficer: { type: String },
  emergencyContact: { type: String, default: "+91 99887-76655" },
  emergencyPoint: { type: String, default: "Safety Station #04" },
  riskLevel: { type: String, enum: ["Low", "Medium", "High"], default: "Low" },
  hazards: [{ type: String }],
  ppe: [{ type: String }],
  safetyChecks: { type: mongoose.Schema.Types.Mixed, default: {} },
  workers: [{
    name: String,
    id: String,
    image: String,
    workerType: { type: String, enum: ["Employee", "Contractor"], default: "Employee" },
    company: String
  }],
  status: { 
    type: String, 
    enum: ["Pending", "Approved", "Rejected"], 
    default: "Pending" 
  },
  date: { type: Date, default: Date.now },
  attachment: { type: String }
};

const workPermitModel = new ajModel("WorkPermit", workPermitSchema);

module.exports = workPermitModel.getModel();
