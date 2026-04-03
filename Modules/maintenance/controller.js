const { Machine, MaintenanceTicket } = require("./model");
const Employee = require("../employees/model");

// Helper to generate Ticket ID
const generateTicketId = async () => {
  const count = await MaintenanceTicket.countDocuments();
  return `MNT-${String(count + 1).padStart(3, "0")}`;
};

// Machines
exports.getMachines = async (req, res) => {
  try {
    const machines = await Machine.find();
    res.status(200).json({ status: true, data: machines });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.addMachine = async (req, res) => {
  try {
    const machine = await Machine.create(req.body);
    res.status(201).json({ status: true, data: machine });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Tickets
exports.getTickets = async (req, res) => {
  try {
    const tickets = await MaintenanceTicket.find()
      .populate("machine")
      .populate("assignedTo")
      .sort({ raisedAt: -1 });
    res.status(200).json({ status: true, data: tickets });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.createTicket = async (req, res) => {
  try {
    const ticketId = await generateTicketId();
    const machine = await Machine.findById(req.body.machine);
    if (!machine) {
      return res.status(404).json({ status: false, message: "Machine not found" });
    }

    const ticketData = {
      ...req.body,
      ticketId,
      machineName: machine.name,
      zone: machine.zone,
      line: machine.line,
      otp: Math.floor(100000 + Math.random() * 900000).toString()
    };

    const ticket = await MaintenanceTicket.create(ticketData);
    
    // Update machine status
    await Machine.findByIdAndUpdate(machine._id, { 
      status: "Issue Active",
      activeTicket: ticket._id 
    });

    res.status(201).json({ status: true, data: ticket });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.assignTicket = async (req, res) => {
  try {
    const { ticketId, assignedTo } = req.body;
    const employee = await Employee.findById(assignedTo);
    if (!employee) {
      return res.status(404).json({ status: false, message: "Technician not found" });
    }

    const ticket = await MaintenanceTicket.findByIdAndUpdate(
      ticketId,
      { 
        status: "In Progress", 
        assignedTo: employee._id, 
        assignedName: employee.name 
      },
      { new: true }
    );

    // Set technician as busy
    await Employee.findByIdAndUpdate(employee._id, { isBusy: true });

    res.status(200).json({ status: true, data: ticket });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.updateTicket = async (req, res) => {
  try {
    const ticket = await MaintenanceTicket.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.status(200).json({ status: true, data: ticket });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.verifyOTP = async (req, res) => {
  try {
    const { ticketId, otp } = req.body;
    const ticket = await MaintenanceTicket.findById(ticketId);
    if (!ticket) {
      return res.status(404).json({ status: false, message: "Ticket not found" });
    }

    if (ticket.otp === otp) {
      ticket.status = "OTP Verified";
      ticket.otpVerified = true;
      ticket.resolvedAt = new Date();
      
      // Calculate downtime
      const diffMs = ticket.resolvedAt - ticket.raisedAt;
      const diffHrs = Math.floor(diffMs / 3600000);
      const diffMins = Math.round((diffMs % 3600000) / 60000);
      ticket.downtime = `${diffHrs}h ${diffMins}m`;

      await ticket.save();

      // Update machine status back to operational
      await Machine.findByIdAndUpdate(ticket.machine, { 
        status: "Operational",
        activeTicket: null 
      });

      // Free up technician
      if (ticket.assignedTo) {
        await Employee.findByIdAndUpdate(ticket.assignedTo, { isBusy: false });
      }

      res.status(200).json({ status: true, message: "OTP Verified Successfully", data: ticket });
    } else {
      res.status(400).json({ status: false, message: "Invalid OTP" });
    }
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

// Technicians (from Employee model)
exports.getTechnicians = async (req, res) => {
  try {
    // Return employees who are technicians/engineers
    // For now, let's just return all employees or filter by some role if possible
    const technicians = await Employee.find({ 
      $or: [
        { designation: /Technician/i },
        { designation: /Engineer/i },
        { department: /Maintenance/i }
      ]
    });
    res.status(200).json({ status: true, data: technicians });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};

exports.getTasksByTechnician = async (req, res) => {
  try {
    const { technicianId } = req.params;
    const tasks = await MaintenanceTicket.find({ 
      assignedTo: technicianId,
      status: { $in: ["Assigned", "In Progress", "Resolved"] }
    })
    .populate("machine")
    .sort({ raisedAt: -1 });
    
    res.status(200).json({ status: true, data: tasks });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message });
  }
};
