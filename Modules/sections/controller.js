const SectionModel = require("./model");
const paginate = require("../../helpers/limitoffset");
const Validator = require("../../helpers/validators");

const validateSectionData = async (data) => {
  const rules = {
    name: "required|string|min:2",
    code: "required|string|min:1",
    supervisorId: "required|string",
  };
  const validator = new Validator(data, rules);
  await validator.validate();
};

exports.add = async (req, res) => {
  try {
    await validateSectionData(req.body);
    const exists = await SectionModel.findOne({
      name: req.body.name.trim(),
    });
    if (exists) {
      return res
        .status(400)
        .json({ status: false, message: "Section already exists" });
    }

    const section = await SectionModel.create({
      name: req.body.name.trim(),
      code: req.body.code?.trim(),
      description: req.body.description?.trim(),
      supervisorId: req.body.supervisorId,
      status: req.body.status || "Active",
    });

    return res.status(201).json({
      status: true,
      message: "Section created successfully",
      data: section,
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
    const { status, supervisorId, page, limit, search } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    const filter = {};
    if (status) filter.status = status;
    if (supervisorId) filter.supervisorId = supervisorId;

    const result = await paginate(
      SectionModel,
      filter,
      pageNumber,
      limit,
      [],
      ["name", "code", "description"],
      search
    );

    return res.status(200).json(result.data);
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
    const sections = await SectionModel.find().sort({ name: 1 });
    return res.status(200).json({
      status: true,
      message: "Records fetched successfully",
      data: sections,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getbyid = async (req, res) => {
  try {
    const section = await SectionModel.findById(req.params.id);
    if (!section) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res
      .status(200)
      .json({ status: true, message: "Record fetched", data: section });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updateData = req.body;
    const updated = await SectionModel.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
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

    const result = await SectionModel.deleteMany({ _id: { $in: recordIds } });
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
