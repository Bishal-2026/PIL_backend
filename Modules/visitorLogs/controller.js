const mongoose = require("mongoose");
const VisitorLogModel = require("./model");
const EmployeeModel = require("../employees/model");
const paginate = require("../../helpers/limitoffset");
const { resolveLocationScope } = require("../../helpers/locationScope");

exports.register = async (req, res) => {
  try {
    const { visitorName, visitorPhone, visitorEmail, visitorImage, employeeId, reason, location } = req.body;

    if (!visitorName || !employeeId) {
      return res.status(400).json({ status: false, message: "Visitor name and Employee ID are required" });
    }

    const employee = await EmployeeModel.findOne({ employeeId });
    if (!employee) {
      return res.status(404).json({ status: false, message: "Employee not found" });
    }

    const visitorId = `GP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const log = await VisitorLogModel.create({
      visitorName,
      visitorPhone,
      visitorEmail,
      visitorImage,
      employeeId,
      employeeName: employee.name || `${employee.firstName} ${employee.lastName}`,
      reason,
      location: location || employee.location,
      timeSlot: req.body.timeSlot || "",
      remark: req.body.remark || "",
      visitorId,
      status: "Pending",
    });

    // In a real app, we would emit a socket event or send a push notification here
    // For now, we'll just return the log object

    return res.status(201).json({
      status: true,
      message: "Visit registered. Waiting for employee approval.",
      data: log,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, rescheduleDate, rescheduleTime, rescheduleReason } = req.body;

    if (!["Approved", "Declined", "Rescheduled", "CheckedIn", "CheckedOut"].includes(status)) {
      return res.status(400).json({ status: false, message: "Invalid status" });
    }

    const updateData = { status };
    if (status === "Approved") {
      updateData.approvedBy = req.user?.name || req.user?.firstName || "Admin";
    }
    if (status === "Rescheduled") {
      updateData.rescheduleDate = rescheduleDate;
      updateData.rescheduleTime = rescheduleTime;
      updateData.rescheduleReason = rescheduleReason;
    }
    if (status === "CheckedIn") {
      updateData.checkInTime = new Date();
    }
    if (status === "CheckedOut") {
      updateData.checkOutTime = new Date();
    }

    const log = await VisitorLogModel.findByIdAndUpdate(id, updateData, { new: true });
    if (!log) {
      return res.status(404).json({ status: false, message: "Visit log not found" });
    }

    // SIMULATED: Share Gate Pass to Email
    if (status === "Approved" && log.visitorEmail) {
      console.log(`[MAIL] Sending Digital Gate Pass to: ${log.visitorEmail}`);
      console.log(`[PASS] Ticket: GP-${log._id.toString().slice(-6).toUpperCase()}`);
    }

    return res.status(200).json({
      status: true,
      message: status === "Approved" ? "Gate Pass Issued and Emailed" : `Visit status updated to ${status}`,
      data: log,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getAll = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const { page, limit, search, status, employeeId } = req.query;
    const pageNumber = Math.max(0, (parseInt(page, 10) || 1) - 1);
    
    const filter = {};
    if (scope.isAdmin) {
      filter.location = scope.location;
    }
    if (status) {
      if (Array.isArray(status)) {
        filter.status = { $in: status };
      } else {
        filter.status = status;
      }
    } else {
      // By default, hide pending and declined unless explicitly requested
      filter.status = { $in: ["Approved", "CheckedIn", "CheckedOut"] };
    }
    if (employeeId) filter.employeeId = employeeId;
    if (req.query.id) filter._id = req.query.id;

    const result = await paginate(
      VisitorLogModel,
      filter,
      pageNumber,
      limit,
      [],
      ["visitorName", "employeeName", "employeeId", "reason"],
      search,
      { createdAt: -1 }
    );

    return res.status(200).json({
      status: true,
      data: result.data,
      total: result.pagination?.totalrecords || 0,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const log = await VisitorLogModel.findById(req.params.id);
    if (!log) return res.status(404).json({ status: false, message: "Not found" });
    return res.status(200).json({ status: true, data: log });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const scope = await resolveLocationScope(req);
    const filter = {};
    if (scope.isAdmin) {
      filter.location = scope.location;
    }

    // Example stats: Visits per day for the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const stats = await VisitorLogModel.aggregate([
      { $match: { ...filter, visitDate: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$visitDate" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Reason distribution
    const reasonStats = await VisitorLogModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$reason",
          count: { $sum: 1 },
        },
      },
    ]);

    // Status distribution
    const statusStats = await VisitorLogModel.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Total visits (explicitly)
    const totalVisits = await VisitorLogModel.countDocuments(filter);

    return res.status(200).json({
      status: true,
      data: {
        dailyVisits: stats,
        reasonStats: reasonStats,
        statusStats: statusStats,
        totalVisits: totalVisits
      },
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message });
  }
};
