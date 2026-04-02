/**
 * Simple API-based seeder.
 * - Logs in with admin credentials
 * - Creates sample contractors, locations, and employees using the public APIs (no direct DB writes).
 * Adjust BASE_URL / credentials as needed before running: `node scripts/api-seed.js`
 */

const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BASE_URL = process.env.BASE_URL || "http://localhost:5000/api";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "sahil@gmail.com";
const ADMIN_PASS =
  process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "Sahil123";

const client = axios.create({ baseURL: BASE_URL, timeout: 15000 });

const login = async () => {
  try {
    const { data } = await client.post("/auth/login", {
      email: ADMIN_EMAIL,
      password: ADMIN_PASS,
      rememberMe: false,
    });
    const token = data?.accessToken || data?.token;
    if (!token) throw new Error("Login failed, no token returned");
    client.defaults.headers.common.Authorization = `Bearer ${token}`;
    return token;
  } catch (err) {
    // Try auto-register admin if login fails and admin isn't already present
    if (err.response?.status === 400 || err.response?.status === 404) {
      console.log("ℹ️ Admin login failed; attempting to register admin user");
      const { data } = await client.post("/auth/register", {
        firstName: "Admin",
        lastName: "User",
        email: ADMIN_EMAIL,
        password: ADMIN_PASS,
        role: "admin",
      });
      const token = data?.accessToken || data?.token;
      if (!token) throw new Error("Register succeeded but no token returned");
      client.defaults.headers.common.Authorization = `Bearer ${token}`;
      return token;
    }
    // If admin already exists with different creds, surface a clear hint
    if (err.response?.data?.message?.includes("already exists")) {
      throw new Error(
        "Admin exists but login failed. Set SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD in .env to valid admin credentials."
      );
    }
    throw err;
  }
};

const seedContractors = async () => {
  const items = [
    // use lowercase status to satisfy any enum (old or new)
    { name: "Primary Contractor", contactPerson: "Jane Doe", contactPhone: "987650001", gstNumber: "GST1001"},
    { name: "Secondary Contractor", contactPerson: "John Roe", contactPhone: "987650002", gstNumber: "GST1002"},
  ];
  for (const item of items) {
    await client.post("/contractors", item);
    console.log("✅ Contractor seeded:", item.name);
  }
};

const seedLocations = async () => {
  const items = [
    { name: "Office Gate", lat: 28.6139, lng: 77.209, radius: 20 },
    { name: "Warehouse", lat: 28.7041, lng: 77.1025, radius: 15 },
  ];
  for (const item of items) {
    await client.post("/location/add", item);
    console.log("✅ Location seeded:", item.name);
  }
};

const seedEmployees = async () => {
  const items = [
    {
      firstName: "Amit",
      lastName: "Sharma",
      gender: "Male",
      dob: "1990-01-01",
      email: "amit.sharma@example.com",
      phone: "5550010001",
      password: "Pass12345",
      currentAddress: { street: "123 Main St", city: "Delhi", state: "DL", pincode: "110001" },
      permanentAddress: { street: "123 Main St", city: "Delhi", state: "DL", pincode: "110001" },
      employeeId: "EMP001",
      rfid: "RFID-EMP-001",
      joiningDate: "2023-01-01",
      designation: "Operator",
      department: "Operations",
      section: "Assembly",
      shift: "Morning",
      employmentType: "Full time",
      role: "employee",
      status: "Active",
      aadharcardnumber: "123412341234",
      pancard: "ABCDE1234F",
      accountNumber: "000111222333",
      ifscCode: "IFSC0001",
      bankDetails: {
        aadharcardnumber: "123412341234",
        pancard: "ABCDE1234F",
        accountNumber: "000111222333",
        ifscCode: "IFSC0001",
      },
      emergencyContact: { name: "Ramesh", relation: "Brother", phone: "9998887771" },
      systemAccess: { emailVerified: true, phoneVerified: false, loginEnabled: true },
    },
  ];

  for (const item of items) {
    await client.post("/employees", item);
    console.log("✅ Employee seeded:", item.email);
  }
};

const ensureLoginUser = async () => {
  // Create the requested login user sahil@gmail.com / Sahil123 if missing
  try {
    await client.post("/auth/register", {
      firstName: "Sahil",
      lastName: "User",
      email: "sahil@gmail.com",
      password: "Sahil123",
      role: "employee",
    });
    console.log("✅ User seeded: sahil@gmail.com / Sahil123");
  } catch (err) {
    if (err.response?.status === 400) {
      console.log("ℹ️ sahil@gmail.com already exists, skipping");
    } else {
      throw err;
    }
  }
};

const run = async () => {
  try {
    await login();
    await ensureLoginUser();
    await seedContractors();
    await seedLocations();
    await seedEmployees();
    console.log("🎉 API seeding completed");
  } catch (err) {
    console.error("❌ Seeding failed:", err.response?.data || err.message);
    process.exit(1);
  }
};

run();
