const mongoose = require("mongoose");
const RfidModel = require("./model");
const paginate = require("../../helpers/limitoffset");
const Validator = require("../../helpers/validators");

const validateRfidData = async (data) => {
  const rules = {
    uid: "required|string",
    employeeId: "string",
    isActive: "boolean",
    lostOrReplaced: "boolean",
    issuedAt: "date",
  };
  const validator = new Validator(data, rules);
  await validator.validate();
};

exports.add = async (req, res) => {
  try {
    await validateRfidData(req.body);

    const exists = await RfidModel.findOne({ uid: req.body.uid });
    if (exists) {
      return res
        .status(400)
        .json({ status: false, message: "RFID card already exists" });
    }

    const card = await RfidModel.create({
      uid: req.body.uid,
      employeeId: req.body.employeeId || undefined,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      lostOrReplaced: req.body.lostOrReplaced || false,
      issuedAt: req.body.issuedAt || Date.now(),
    });
    return res.status(201).json({
      status: true,
      message: "RFID created successfully",
      data: card,
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
    const { isActive, page, limit, search } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    const filter = {};
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const result = await paginate(
      RfidModel,
      filter,
      pageNumber,
      limit,
      ["employeeId"],
      ["uid"],
      search
    );
    return res.status(200).json({
      success: true,
      data: result.data,
      total: result.pagination?.totalrecords || result.data.length || 0,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

exports.getbyid = async (req, res) => {
  try {
    const { id } = req.params;
    let card = null;

    if (mongoose.isValidObjectId(id)) {
      card = await RfidModel.findById(id);
    }
    if (!card) {
      card = await RfidModel.findOne({ uid: id });
    }

    if (!card) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res
      .status(200)
      .json({ status: true, message: "Record fetched", data: card });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await RfidModel.findByIdAndUpdate(req.params.id, req.body, {
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

    const result = await RfidModel.deleteMany({ _id: { $in: recordIds } });
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
