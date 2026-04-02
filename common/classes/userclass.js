const UserModel = require("../../Modules/user/model");
const SECRET_KEY = process.env.JWT_SECRET || process.env.SECRET_KEY;

class User {
  constructor(firstName, lastName, email, phone, password, role) {
    this.firstName = firstName;
    this.lastName = lastName;
    this.email = email;
    this.phone = phone;
    this.password = password;
    this.role = role || "user"; // Default role if not provided
  }
  
  // Set allowed roles dynamically
  static setAllowedRoles(roles) {
    this.ALLOWED_ROLES = roles; // Dynamically set allowed roles
  }
  
  // Check if a role is allowed
  static isRoleAllowed(role) {
    return this.ALLOWED_ROLES && this.ALLOWED_ROLES.includes(role);
  }
  
  // Save user details to MongoDB
  async save() {
    try {
      // Create a new user using the Mongoose model
      const newUser = new UserModel({
        firstName: this.firstName,
        lastName: this.lastName,
        email: this.email,
        phone: this.phone,
        password: this.password,
        role: this.role,
      });
      
      // Save to the database and return the saved user
      const savedUser = await newUser.save();
      return savedUser;
    } catch (error) {
      throw new Error("Error saving user to database: " + error.message);
    }
  }
  
  // Find user by email in MongoDB
  static async findByEmail(email) {
    try {
      const user = await UserModel.findOne({ email });
      return user;
    } catch (error) {
      throw new Error("Error finding user: " + error.message);
    }
  }
  
  // Update user password in MongoDB
  async updatePassword(newPassword) {
    try {
      this.password = newPassword;
      const updatedUser = await UserModel.findByIdAndUpdate(
        this._id, // Find user by _id
        { password: newPassword }, // New password to update
        { new: true } // Return the updated user
      );
      return updatedUser;
    } catch (error) {
      throw new Error("Error updating password: " + error.message);
    }
  }
  
  // Generate JWT token for user
  async generateJWT() {
    const jwt = require("jsonwebtoken");
    try {
      const token = jwt.sign({ id: this._id, email: this.email }, SECRET_KEY, {
        expiresIn: "1h",
      });
      return token;
    } catch (error) {
      throw new Error("Error generating JWT: " + error.message);
    }
  }
}

module.exports = User;
