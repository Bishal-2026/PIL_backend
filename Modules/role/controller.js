const RoleModel = require("./model");
const paginate = require("../../helpers/limitoffset");
const Validator = require("../../helpers/validators");

const validateRoleData = async (data) => {
  const rules = {
    name: "required|string|min:2",
  };
  const validator = new Validator(data, rules);
  await validator.validate();
};

exports.add = async (req, res) => {
  try {
    await validateRoleData(req.body);

    const exists = await RoleModel.findOne({ name: req.body.name.trim() });
    if (exists) {
      return res
        .status(400)
        .json({ status: false, message: "Role already exists" });
    }

    const role = await RoleModel.create(req.body);
    return res.status(201).json({
      status: true,
      message: "Role created successfully",
      data: role,
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
    const filter = {};
    if (status) filter.status = status;

    const result = await paginate(
      RoleModel,
      filter,
      page,
      limit,
      [],
      ["name", "description", "status"],
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

exports.getbyid = async (req, res) => {
  try {
    const role = await RoleModel.findById(req.params.id);
    if (!role) {
      return res.status(404).json({ status: false, message: "Not found" });
    }
    return res
      .status(200)
      .json({ status: true, message: "Record fetched", data: role });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const updated = await RoleModel.findByIdAndUpdate(req.params.id, req.body, {
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

    const result = await RoleModel.deleteMany({ _id: { $in: recordIds } });
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
