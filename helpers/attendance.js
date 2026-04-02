const AttendanceModel = require("../Modules/attendance/model");

const getDayRange = (date) => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const markAttendance = async (employee, action, userId, location, locationId) => {
  const { start, end } = getDayRange(new Date());
  const now = new Date();

  if (action === "login") {
    return AttendanceModel.create({
      rfidCardId: employee.rfid,
      employeeId: employee.employeeId,
      userId: userId || employee.userId || null,
      location: location || null,
      locationId: locationId || null,
      date: start,
      entryGateIn: now,
      sectionAssigned: employee.section,
      status: "Present",
      metadata: {
        action: "login",
      },
    });
  }

  if (action === "logout") {
    const lastLogin = await AttendanceModel.findOne({
      employeeId: employee.employeeId,
      date: { $gte: start, $lte: end },
      entryGateIn: { $exists: true },
      "metadata.action": "login",
    }).sort({ entryGateIn: -1, createdAt: -1 });
    let totalWorkHours = null;
    if (lastLogin?.entryGateIn) {
      const diffMs = now.getTime() - lastLogin.entryGateIn.getTime();
      totalWorkHours = Math.max(0, diffMs / (1000 * 60 * 60));
    }
    return AttendanceModel.create({
      rfidCardId: employee.rfid,
      employeeId: employee.employeeId,
      userId: userId || employee.userId || null,
      location: location || null,
      locationId: locationId || null,
      date: start,
      exitGateOut: now,
      totalWorkHours,
      sectionAssigned: employee.section,
      status: "Present",
      metadata: {
        action: "logout",
        entryGateIn: lastLogin?.entryGateIn || null,
        entryId: lastLogin?._id || null,
      },
    });
  }

  return null;
};

module.exports = { markAttendance };
