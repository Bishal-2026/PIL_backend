const mongoose = require("mongoose");
const ContractorModel = require("./model");
const paginate = require("../../helpers/limitoffset");
const Validator = require("../../helpers/validators");

const validateContractorData = async (data) => {
  const rules = {
    name: "required|string|min:2",
    contactPerson: "required|string|min:2",
    contactPhone: "required|string|min:5",
    // code optional; we'll generate if missing
  };
  const validator = new Validator(data, rules);
  await validator.validate();
};

const generateContractorCode = () =>
  `CTR-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

exports.add = async (req, res) => {
  try {
    await validateContractorData(req.body);

    // ensure code
    const code = req.body.code || generateContractorCode();
    // normalize status casing
    const normalizedStatus =
      (req.body.status || "Active").toString().toLowerCase() === "active"
        ? "Active"
        : "Inactive";

    const exists = await ContractorModel.findOne({ code });
    if (exists) {
      return res
        .status(400)
        .json({ status: false, message: "Contractor already exists" });
    }

    const contractor = await ContractorModel.create({
      ...req.body,
      code,
      status: normalizedStatus,
    });
    return res.status(201).json({
      status: true,
      message: "Contractor created successfully",
      data: contractor,
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
    const { status, page, limit, search } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    const filter = {};
    if (status) filter.status = status;

    const result = await paginate(
      ContractorModel,
      filter,
      pageNumber,
      limit,
      [],
      ["name", "code", "contactPerson", "contactPhone", "gstNumber"],
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

exports.getbyid = async (req, res) => {
  try {
    const contractor = await ContractorModel.findById(req.params.id);
    if (!contractor) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res
      .status(200)
      .json({ status: true, message: "Record fetched", data: contractor });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await ContractorModel.findByIdAndUpdate(
      req.params.id,
      req.body,
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
    if (recordIds === "undefined") {
      return res
        .status(400)
        .json({ status: false, message: "Record ID(s) not found" });
    }

    if (typeof recordIds === "string") recordIds = [recordIds];
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Record ID(s) must be a non-empty string or array",
      });
    }

    const objectIds = recordIds.filter((id) => mongoose.isValidObjectId(id));
    const codes = recordIds.filter(
      (id) => typeof id === "string" && !mongoose.isValidObjectId(id)
    );

    if (objectIds.length === 0 && codes.length === 0) {
      return res
        .status(400)
        .json({ status: false, message: "No valid IDs or codes provided" });
    }

    let filter = {};
    if (objectIds.length && codes.length) {
      filter = {
        $or: [{ _id: { $in: objectIds } }, { code: { $in: codes } }],
      };
    } else if (objectIds.length) {
      filter = { _id: { $in: objectIds } };
    } else {
      filter = { code: { $in: codes } };
    }

    const result = await ContractorModel.deleteMany(filter);
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
