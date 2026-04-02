const ShiftModel = require("./model");
const paginate = require("../../helpers/limitoffset");
const Validator = require("../../helpers/validators");

const validateShiftData = async (data) => {
  const rules = {
    shiftName: "required|string|min:2",
    startTime: "required|date",
    endTime: "required|date",
    sectionId: "required",
    supervisorId: "required",
  };
  const validator = new Validator(data, rules);
  await validator.validate();
};

exports.add = async (req, res) => {
  try {
    await validateShiftData(req.body);

    const exists = await ShiftModel.findOne({
      shiftName: req.body.shiftName.trim(),
      sectionId: req.body.sectionId,
    });
    if (exists) {
      return res
        .status(400)
        .json({ status: false, message: "Shift already exists in this section" });
    }

    const shift = await ShiftModel.create({
      shiftName: req.body.shiftName.trim(),
      sectionId: req.body.sectionId,
      supervisorId: req.body.supervisorId,
      contractors: req.body.contractors || [],
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      breakTimes: req.body.breakTimes || [],
      plannedHeadcount: req.body.plannedHeadcount || 0,
      actualHeadcount: req.body.actualHeadcount || 0,
      status: req.body.status || "scheduled",
      overtimeAllowed: req.body.overtimeAllowed || false,
      notes: req.body.notes?.trim(),
    });

    return res.status(201).json({
      status: true,
      message: "Shift created successfully",
      data: shift,
    });
  } catch (error) {
    if (error.errors) {
      return res.status(400).json({
        status: false,
        message: error.message || "Validation failed",
        errors: error.errors,
      });
    }
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const { status, sectionId, supervisorId, page, limit, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (sectionId) filter.sectionId = sectionId;
    if (supervisorId) filter.supervisorId = supervisorId;

    const result = await paginate(
      ShiftModel,
      filter,
      page,
      limit,
      ["sectionId", "supervisorId", "contractors"],
      ["shiftName", "notes", "status"],
      search
    );

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

exports.getList = async (_req, res) => {
  try {
    const shifts = await ShiftModel.find().sort({ startTime: 1 });
    return res.status(200).json({
      status: true,
      message: "Records fetched successfully",
      data: shifts,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getbyid = async (req, res) => {
  try {
    const shift = await ShiftModel.findById(req.params.id);
    if (!shift) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res
      .status(200)
      .json({ status: true, message: "Record fetched", data: shift });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await ShiftModel.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!updated) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res.status(200).json({
      status: true,
      message: "Updated successfully",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.delete = async (req, res) => {
  try {
    let recordIds = req.body?.recordId || req.params?.id;
    if (!recordIds) {
      return res
        .status(404)
        .json({ status: false, message: "Record ID(s) not found" });
    }
    if (typeof recordIds === "string") recordIds = [recordIds];
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Record ID(s) must be a non-empty string or array",
      });
    }

    const result = await ShiftModel.deleteMany({ _id: { $in: recordIds } });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ status: false, message: "No matching records found" });
    }

    return res.status(200).json({
      status: true,
      message: `${result.deletedCount} record(s) deleted successfully`,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
