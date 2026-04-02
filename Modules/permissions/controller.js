const permissionsModel = require("./model.js");
const paginate = require("../../helpers/limitoffset.js");
const Validator = require("../../helpers/validators.js");
const fs = require("fs");
const path = require("path");
/**************************************validateData starts here***************************************************/
const validateData = async (data) => {
  const rules = {
    role: "required",
    modules: "required",
  };

  const validator = new Validator(data, rules);
  await validator.validate();
};
/**************************************validateData ends here***************************************************/

/*****************************add starts here*****************************************/
exports.add = async (req, res) => {
  try {
    await validateData(req.body);
    const { role, business_type, modules, hierarchy } = req.body;
    const permission = new permissionsModel({
      role,
      business_type,
      modules,
      hierarchy,
    });
    await permission.save();
    res.status(201).json({
      status: true,
      message: "Permissions created successfully",
      permission,
    });
  } catch (error) {
    if (error.errors) {
      return res.status(400).json({
        status: false,
        message: error.message || "Validation failed",
        errors: error.errors,
      });
    }
    res.status(500).json({ status: false, message: error.message });
  }
};
/*****************************add ends here*****************************************/
/*****************************getbyid starts here*****************************************/
exports.getbyid = async (req, res) => {
  try {
    const permission = await permissionsModel.findById(req.params.id);

    if (!permission) {
      return res.status(404).json({ status: false, message: "Role not found" });
    }

    res.status(200).json({
      status: true,
      message: "fetch role data successfully",
      data: permission,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
/*****************************getbyid ends here*****************************************/
/*****************************getAll starts  here*****************************************/
exports.getAll = async (req, res) => {
  try {
    var result = [];
    const { role, modules, page, limit, search } = req.query;
    let filter = {};
    if (role) filter.role = role;
    if (modules) filter.modules = modules;

    var result = await paginate(
      permissionsModel,
      filter,
      page,
      limit,
      [],
      ["role", "modules"],
      search
    );

    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Server Error", error: error.message });
  }
};
/*****************************getAll ends here*****************************************/
/*******************************************************************************************/
exports.search = async (req, res) => {
  try {
    var result = [];
    const { role, page, limit } = req.query;
    let filter = {};
    if (role) filter.role = { $regex: role, $options: "i" };

    var result = await paginate(permissionsModel, filter, page, limit);
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ status: false, message: "Server Error", error: error.message });
  }
};
/*******************************************************************************************/

/*****************************update starts here*****************************************/
exports.update = async (req, res) => {
  try {
    await validateData(req.body);
    const { role, modules, hierarchy } = req.body;
    const recordId = req.params.id;
    if (!recordId) {
      return res
        .status(404)
        .json({ status: false, message: "record not found" });
    }
    const updated = await permissionsModel.findByIdAndUpdate(
      recordId,
      { role, modules, hierarchy },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res
        .status(404)
        .json({ status: false, message: "No records found" });
    }

    res.status(200).json({
      status: true,
      message: "Updated successfully",
      permissions: updated,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
/*****************************update ends here*****************************************/
/*****************************delete starts here*****************************************/

exports.delete = async (req, res) => {
  try {
    // Accept from body or URL param
    let recordIds = req.body?.recordId || req.params?.id;

    if (!recordIds) {
      return res
        .status(404)
        .json({ status: false, message: "Record ID(s) not found" });
    }

    // Convert single ID string to array
    if (typeof recordIds === "string") {
      recordIds = [recordIds];
    }

    // Final validation
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      return res.status(400).json({
        status: false,
        message: "Record ID(s) must be a non-empty string or array",
      });
    }

    const result = await permissionsModel.deleteMany({
      _id: { $in: recordIds },
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        status: false,
        message: "No matching records found to delete",
      });
    }

    res.status(200).json({
      status: true,
      message: `${result.deletedCount} record(s) deleted successfully`,
    });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

/*****************************delete ends here*****************************************/

/**********************Permission File Creation *************************/
exports.FileCreate = async (req, res) => {
  try {
    const allPermissions = await permissionsModel.find();

    const permissionsObject = {};

    allPermissions.forEach((permissionDoc) => {
      permissionsObject[permissionDoc.role] = {
        hierarchy: permissionDoc.hierarchy,
        modules: permissionDoc.modules,
      };
    });

    const filePath = path.join(__dirname, "../config/permissions.json"); // Adjust path if needed

    fs.writeFileSync(
      filePath,
      JSON.stringify(permissionsObject, null, 2),
      "utf-8"
    );

    return res.status(200).json({
      status: true,
      message: "Permissions exported successfully to permissions.json",
      filePath,
    });
  } catch (error) {
    console.error("Error exporting permissions:", error);
    return res.status(500).json({
      status: false,
      message: "Failed to export permissions",
      error: error.message,
    });
  }
};

/**********************Permissions File Ends******************************** */
/**********************getPermissions starts******************************** */
exports.getPermissions = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!role) {
      return res.status(400).json({
        status: false,
        message: "User role is missing in token.",
      });
    }

    const permissions = await permissionsModel.findOne({ role });

    if (!permissions) {
      return res.status(404).json({
        status: false,
        message: "No permissions found for this role.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Permissions fetched successfully",
      data: permissions,
    });
  } catch (error) {
    console.error("Error fetching permissions:", error);
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message,
    });
  }
};
/**********************getPermissions ends******************************** */
