const { ajModel, mongoose } = require("../../common/classes/Model");

/* ===========================
   Attendance Schema Definition
=========================== */
const attendanceSchemaDefinition = {
  rfidCardId: {
    type: String, // accept RFID uid (e.g., RFID-EMP-001)
    required: true,
    trim: true,
  },

  employeeId: { type: String, trim: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  deviceId: { type: String, trim: true, index: true },
  location: { type: String, trim: true },
  locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", default: null, index: true },

  date: {
    type: Date,
    required: true,
  },

  entryGateIn: { type: Date },
  workfloorIn: { type: Date },
  workfloorOut: { type: Date },
  exitGateOut: { type: Date },
  totalWorkHours: { type: Number, default: null },

  sectionAssigned: {
    type: String, // accept code or name
    required: true,
    trim: true,
  },

  hrApproved: {
    type: Boolean,
    default: false,
  },
  hrApprovedAt: { type: Date },

  supervisorApproved: {
    type: Boolean,
    default: false,
  },
  supervisorApprovedAt: { type: Date },

  isFinalized: {
    type: Boolean,
    default: false,
  },

  remarks: {
    type: String,
    trim: true,
  },

  status: {
    type: String,
    enum: ["Present", "Absent", "HalfDay", "Leave"],
    default: "Present",
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
};

/* ===========================
   Response Transform
=========================== */
const attendanceTransform = (ret) => {
  return {
    id: ret._id,
    employeeId: ret.employeeId,
    userId: ret.userId,
    deviceId: ret.deviceId,
    rfidCardId: ret.rfidCardId,
    location: ret.location,
    locationId: ret.locationId,
    date: ret.date,

    timings: {
      entryGateIn: ret.entryGateIn,
      workfloorIn: ret.workfloorIn,
      workfloorOut: ret.workfloorOut,
      exitGateOut: ret.exitGateOut,
    },
    totalWorkHours: ret.totalWorkHours,

    sectionAssigned: ret.sectionAssigned,

    approvals: {
      hrApproved: ret.hrApproved,
      hrApprovedAt: ret.hrApprovedAt,
      supervisorApproved: ret.supervisorApproved,
      supervisorApprovedAt: ret.supervisorApprovedAt,
    },

    isFinalized: ret.isFinalized,
    status: ret.status,
    remarks: ret.remarks,
    metadata: ret.metadata,

    createdAt: ret.createdAt,
    updatedAt: ret.updatedAt,
  };
};

/* ===========================
   Model Creation
=========================== */
const AttendanceModel = new ajModel(
  "Attendance",
  attendanceSchemaDefinition,
  attendanceTransform
);

module.exports = AttendanceModel.getModel();
