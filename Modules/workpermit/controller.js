const WorkPermit = require("./model");

// Helper to generate Permit ID
const generatePermitId = async () => {
    // WP- random 6 digit
    return `WP-${Math.floor(Math.random() * 900000 + 100000)}`;
};

exports.getAll = async (req, res) => {
  try {
    const { status, assignedApprover } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (assignedApprover) filter.assignedApprover = assignedApprover;

    const permits = await WorkPermit.find(filter).sort({ date: -1 });
    res.status(200).json({ status: true, data: permits });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.getPublic = async (req, res) => {
  try {
    // TV Display: Only show approved permits
    const permits = await WorkPermit.find({ status: "Approved" }).sort({ date: -1 });
    res.status(200).json({ status: true, data: permits });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const permit = await WorkPermit.findById(req.params.id);
    if (!permit) {
      return res.status(404).json({ status: false, message: "Permit not found" });
    }
    res.status(200).json({ status: true, data: permit });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const permitData = { ...req.body };
    if (!permitData.permitId) {
        permitData.permitId = await generatePermitId();
    }
    // Set initial status
    permitData.status = "Pending";
    
    const permit = await WorkPermit.create(permitData);
    res.status(201).json({ status: true, data: permit });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Approved", "Rejected"].includes(status)) {
        return res.status(400).json({ status: false, message: "Invalid status update" });
    }

    const permit = await WorkPermit.findByIdAndUpdate(id, { status }, { new: true });
    if (!permit) {
        return res.status(404).json({ status: false, message: "Permit not found" });
    }

    res.status(200).json({ status: true, message: `Permit ${status} successfully`, data: permit });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const permit = await WorkPermit.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!permit) {
      return res.status(404).json({ status: false, message: "Permit not found" });
    }
    res.status(200).json({ status: true, data: permit });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const permit = await WorkPermit.findByIdAndDelete(req.params.id);
    if (!permit) {
      return res.status(404).json({ status: false, message: "Permit not found" });
    }
    res.status(200).json({ status: true, message: "Permit deleted successfully" });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
exports.getOptions = async (req, res) => {
  try {
    const fields = [
      "workType", "riskLevel", "plant", "area", "location", 
      "requestedBy", "supervisor", "safetyOfficer", "assignedApprover"
    ];
    
    const options = {};
    for (const field of fields) {
      options[field] = await WorkPermit.distinct(field);
    }

    res.status(200).json({ status: true, data: options });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
