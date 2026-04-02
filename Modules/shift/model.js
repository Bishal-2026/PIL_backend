const { ajModel, mongoose } = require("../../common/classes/Model");

const shiftSchema = {
  shiftName: {
    type: String,
    required: true,
    trim: true
  },
  sectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Section",
    required: true
  },
  supervisorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Users",
    required: true
  },
  contractors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Contractor"
  }],
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  breakTimes: [
    {
      from: { type: String },
      to: { type: String },
    },
  ],
  plannedHeadcount: {
    type: Number,
    default: 0
  },
  actualHeadcount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ["scheduled", "ongoing", "completed", "cancelled"],
    default: "scheduled",
  },
  overtimeAllowed: {
    type: Boolean,
    default: false
  },
  notes: {
    type: String,
    trim: true
  },
};

const ShiftModel = new ajModel("Shift", shiftSchema).getModel();
module.exports = ShiftModel;
