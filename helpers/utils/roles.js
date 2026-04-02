const roles = {
  superadmin: { can: ["manage_all"] },
  admin: { can: ["manage_all"] },
  hr: {
    can: [
      "read_user",
      "create_user",
      "update_user",
      "read_employees",
      "create_employees",
      "update_employees",
      "read_contractors",
      "create_contractors",
      "update_contractors",
      "read_sections",
      "create_sections",
      "update_sections",
      "read_shift",
      "create_shift",
      "update_shift",
      "read_attendance",
      "create_attendance",
      "update_attendance",
      "read_rfid",
      "create_rfid",
      "update_rfid",
    ],
  },
  supervisor: {
    can: [
      "read_employees",
      "read_contractors",
      "read_sections",
      "read_shift",
      "read_attendance",
      "update_attendance",
    ],
  },
  manager: {
    can: [
      "read_user",
      "read_employees",
      "read_contractors",
      "read_sections",
      "read_shift",
      "read_attendance",
      "read_rfid",
    ],
  },
  employee: {
    can: ["read_sections", "read_shift"],
  },
  contractor: {
    can: ["read_sections", "read_shift"],
  },
  
};

module.exports = roles;
