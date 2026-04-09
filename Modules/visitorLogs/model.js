const { ajModel, mongoose } = require("../../common/classes/Model");

const visitorLogSchemaDefinition = {
  visitorName: { type: String, trim: true, required: true },
  visitorPhone: { type: String, trim: true, default: "" },
  visitorEmail: { type: String, trim: true, lowercase: true, default: "" },
  visitorImage: { type: String, trim: true, default: "" },
  employeeId: { type: String, trim: true, index: true }, // Employee ID of the person being visited
  employeeName: { type: String, trim: true, default: "" },
  reason: { type: String, trim: true, default: "" },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Declined", "Rescheduled", "CheckedIn", "CheckedOut"],
    default: "Pending",
  },
  rescheduleDate: { type: Date, default: null },
  rescheduleTime: { type: String, trim: true, default: "" },
  rescheduleReason: { type: String, trim: true, default: "" },
  visitDate: { type: Date, default: Date.now },
  checkInTime: { type: Date, default: null },
  checkOutTime: { type: Date, default: null },
  location: { type: String, trim: true, default: "", index: true },
  timeSlot: { type: String, trim: true, default: "" },
  remark: { type: String, trim: true, default: "" },
  visitorId: { type: String, trim: true, default: "", index: true },
  approvedBy: { type: String, trim: true, default: "" },
  metadata: { type: Object, default: {} },
};

const visitorLogTransform = (ret) => ({
  id: ret._id,
  visitorName: ret.visitorName,
  visitorPhone: ret.visitorPhone,
  visitorEmail: ret.visitorEmail,
  visitorImage: ret.visitorImage,
  employeeId: ret.employeeId,
  employeeName: ret.employeeName,
  reason: ret.reason,
  status: ret.status,
  rescheduleDate: ret.rescheduleDate,
  rescheduleTime: ret.rescheduleTime,
  rescheduleReason: ret.rescheduleReason,
  visitDate: ret.visitDate,
  checkInTime: ret.checkInTime,
  checkOutTime: ret.checkOutTime,
  location: ret.location,
  timeSlot: ret.timeSlot,
  remark: ret.remark,
  visitorId: ret.visitorId,
  approvedBy: ret.approvedBy,
  createdAt: ret.createdAt,
  updatedAt: ret.updatedAt,
});

const VisitorLogModel = new ajModel("VisitorLog", visitorLogSchemaDefinition, visitorLogTransform);

module.exports = VisitorLogModel.getModel();
