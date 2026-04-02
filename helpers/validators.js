const User = require("../common/classes/userclass");

class Validator {
  constructor(data, rules) {
    this.data = data;
    this.rules = rules;
    this.errors = {};
  }
  validate_required_if(value, param) {
    const [otherField, expectedValue] = param.split(",");

    const otherValue = this.data[otherField];

    if (otherValue === expectedValue) {
      return this.validate_required(value);
    }

    return true;
  }
  // validate() {
  //   for (const field in this.rules) {
  //     const fieldRules = this.rules[field].split("|");
  //     const value = this.data[field];

  //     for (const rule of fieldRules) {
  //       const [ruleName, ruleParam] = rule.includes(":")
  //         ? rule.split(":")
  //         : [rule];

  //       if (!this[`validate_${ruleName}`]) {
  //         throw new Error(`Validation rule "${ruleName}" is not defined.`);
  //       }

  //       const isValid = this[`validate_${ruleName}`](value, ruleParam);
  //       if (!isValid) {
  //         this.addError(field, ruleName, ruleParam);
  //       }
  //     }
  //   }

  //   if (Object.keys(this.errors).length > 0) {
  //     const error = new Error("Validation failed");
  //     error.status = 400; // Set HTTP status code
  //     error.errors = this.errors; // Attach errors object
  //     throw error;
  //   }

  //   return true;
  // }
  getValueByPath(path) {
    return path.split(".").reduce((obj, key) => (obj ? obj[key] : undefined), this.data);
  }

  validate() {
    for (const field in this.rules) {
      const fieldRules = this.rules[field].split("|");

      // Handle wildcard rules like subDepartments.*.name
      if (field.includes(".*.")) {
        const [arrayField, nestedKey] = field.split(".*.");
        const items = this.data[arrayField];

        if (Array.isArray(items)) {
          items.forEach((item, index) => {
            const value = item[nestedKey];
            for (const rule of fieldRules) {
              const [ruleName, ruleParam] = rule.includes(":")
                ? rule.split(":")
                : [rule];

              if (!this[`validate_${ruleName}`]) {
                throw new Error(
                  `Validation rule "${ruleName}" is not defined.`
                );
              }

              const isValid = this[`validate_${ruleName}`](value, ruleParam);
              if (!isValid) {
                this.addError(
                  `${arrayField}[${index}].${nestedKey}`,
                  ruleName,
                  ruleParam
                );
              }
            }
          });
        } else {
          this.addError(arrayField, "array");
        }
      } else {
        // Normal or dotted fields
        const value = field.includes(".")
          ? this.getValueByPath(field)
          : this.data[field];
        for (const rule of fieldRules) {
          const [ruleName, ruleParam] = rule.includes(":")
            ? rule.split(":")
            : [rule];

          if (!this[`validate_${ruleName}`]) {
            throw new Error(`Validation rule "${ruleName}" is not defined.`);
          }

          const isValid = this[`validate_${ruleName}`](value, ruleParam);
          if (!isValid) {
            this.addError(field, ruleName, ruleParam);
          }
        }
      }
    }

    if (Object.keys(this.errors).length > 0) {
      const firstField = Object.keys(this.errors)[0];
      const firstMessage = this.errors[firstField]?.[0];
      const error = new Error(firstMessage || "Validation failed");
      error.status = 400;
      error.errors = this.errors;
      error.firstMessage = firstMessage;
      throw error;
    }

    return true;
  }

  addError(field, rule, param) {
    const messages = {
      required: `${field} is required.`,
      min: `${field} must be at least ${param} characters long.`,
      max: `${field} must not exceed ${param} characters.`,
      size: `${field} must be exactly ${param} characters long.`,
      email: `${field} must be a valid email.`,
      numeric: `${field} must be a number.`,
      array: `${field} must be a array.`,
      object: `${field} must be an object.`,
      integer: `${field} must be a number.`,
      min_value: `${field} must be a min.`,
      string: `${field} must be a string.`,
      date: `${field} must be a valid date.`,
      boolean: `${field} must be a boolean.`,
      in: `${field} must be one of the following values: ${param}.`,
      string: `${field} must be a string.`,
    };

    if (!this.errors[field]) {
      this.errors[field] = [];
    }
    this.errors[field].push(messages[rule]);
  }

  validate_required(value) {
    return value !== undefined && value !== null && value !== "";
  }

  validate_min(value, param) {
    const min = parseFloat(param);

    if (typeof value === "string" || Array.isArray(value)) {
      return value.length >= min;
    }

    if (typeof value === "number") {
      return value >= min;
    }

    return false;
  }
  validate_object(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  validate_max(value, param) {
    const max = parseFloat(param);

    if (typeof value === "string" || Array.isArray(value)) {
      return value.length <= max;
    }

    if (typeof value === "number") {
      return value <= max;
    }

    return false;
  }

  validate_array(value) {
    return Array.isArray(value);
  }
  validate_string(value) {
    return typeof value === "string";
  }

  validate_boolean(value) {
    return typeof value === "boolean";
  }

  // Size validation (exact length)
  validate_size(value, param) {
    return typeof value === "string" && value.length === parseInt(param);
  }
  validate_email(value) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(value);
  }

  validate_integer(value) {
    return !isNaN(value);
  }
  validate_numeric(value) {
    return !isNaN(value);
  }
  validate_min_value(value, param) {
    return typeof value === "number" && value >= parseFloat(param);
  }
  // String validation
  validate_string(value) {
    return typeof value === "string";
  }

  // Date validation
  validate_date(value) {
    return !isNaN(Date.parse(value));
  }

  // Validation for specific values (e.g., gender must be Male/Female/Other)
  validate_in(value, param) {
    const allowedValues = param.split(",");
    return allowedValues.includes(value);
  }
  static isnotEmpty(value, minLength = 1) {
    return value && value.trim().length >= minLength;
  }
  static isvalidEmail(email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    return emailRegex.test(email);
  }
  static isvalidPassword(password) {
    return typeof password === "string" && password.trim().length >= 8;
  }

  static isvalidRole(role) {
    return User.isRoleAllowed(role);
  }
}
module.exports = Validator;

// static validateParentData({
//   gender,
//   phone,
//   email,
//   address,
//   occupation,
//   student_id,
//   emergency_contact,
// }) {
//   if (!this.isnotEmpty(phone)) {
//     throw new Error("Contact is required");
//   }
//   if (!this.isnotEmpty(email)) {
//     throw new Error("Email is required");
//   }
//   if (!this.isnotEmpty(gender)) {
//     throw new Error("select gender");
//   }
//   if (!this.isnotEmpty(address)) {
//     throw new Error("Please fill your address");
//   }
//   if (!this.isnotEmpty(occupation)) {
//     throw new Error("Please fill your occupation");
//   }
//   if (!this.isnotEmpty(student_id)) {
//     throw new Error("Student id is required");
//   }
//   if (!this.isnotEmpty(emergency_contact)) {
//     throw new Error("Emergency contact is required");
//   }
//   return true;
// }

// static validateExamData({ examName, Class, subjects, examType, Status }) {
//   if (!examName) throw new Error("Exam name is required");
//   if (!Class) throw new Error("Class is required");
//   if (!examType) throw new Error("Exam type is required");
//   if (!Status) throw new Error("Status is required");

//   // Ensure subjects is an array and not empty
//   if (!Array.isArray(subjects) || subjects.length === 0) {
//     throw new Error("At least one subject is required");
//   }

//   // Validate each subject in the array
//   subjects.forEach((subject) => {
//     if (!subject.subjectName) throw new Error("Subject name is required");
//     if (!subject.subjectTeacher)
//       throw new Error("Subject teacher is required");
//     if (!subject.maxMarks) throw new Error("Maximum marks is required");
//     if (!subject.passingMarks) throw new Error("Passing marks is required");
//     if (!subject.examDate) throw new Error("Exam date is required");
//     if (!subject.startTime) throw new Error("Start time is required");
//     if (!subject.endTime) throw new Error("End time is required");
//   });

//   return true;
// }
// static validateAdmissionData(data) {
//   const errors = [];

//   // Validate Personal Details
//   if (!data.personal_details) {
//     errors.push("Personal details are required");
//   } else {
//     const { studentName, dob, address, contact, email, bgroup } =
//       data.personal_details;

//     if (!studentName) errors.push("Student name is required");
//     if (!dob) errors.push("Date of birth is required");
//     if (!address) errors.push("Address is required");
//     if (!contact) errors.push("Contact number is required");

//     // Validate Email Format
//     const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
//     if (!email || !emailRegex.test(email))
//       errors.push("A valid email is required");

//     // Validate Blood Group
//     const validBloodGroups = [
//       "A+",
//       "A-",
//       "B+",
//       "B-",
//       "AB+",
//       "AB-",
//       "O+",
//       "O-",
//     ];
//     if (!bgroup || !validBloodGroups.includes(bgroup))
//       errors.push("A valid blood group is required");
//   }

//   // Validate Academic Performance
//   if (!data.academic_performance) {
//     errors.push("Academic performance details are required");
//   } else {
//     const {
//       schoolname,
//       schooladdress,
//       completed,
//       percentage,
//       photo,
//       marklist,
//       signature,
//     } = data.academic_performance;

//     if (!schoolname) errors.push("School name is required");
//     if (!schooladdress) errors.push("School address is required");

//     // Validate 'Completed' Field
//     if (!completed || !["Yes", "No"].includes(completed)) {
//       errors.push("Completed field must be 'Yes' or 'No'");
//     }

//     // Validate Percentage
//     if (percentage === undefined || percentage < 0 || percentage > 100) {
//       errors.push("Percentage must be between 0 and 100");
//     }

//     if (!photo) errors.push("Photo is required");
//     if (!marklist) errors.push("Marklist is required");
//     if (!signature) errors.push("Signature is required");
//   }

//   // Validate Parent/Guardian Information
//   if (!data.parent_guardianinfo) {
//     errors.push("Parent/Guardian information is required");
//   } else {
//     const { fathername, mothername, fathercontact, mothercontact } =
//       data.parent_guardianinfo;

//     if (!fathername) errors.push("Father's name is required");
//     if (!mothername) errors.push("Mother's name is required");
//     if (!fathercontact) errors.push("Father's contact number is required");
//     if (!mothercontact) errors.push("Mother's contact number is required");
//   }

//   return {
//     success: errors.length === 0,
//     errors,
//   };
// }
// static validateClassData({
//   className,
//   section,
//   classTeacher,
//   students,
//   subjects,
// }) {
//   if (!this.isnotEmpty(className)) {
//     throw new Error("Class name is required");
//   }
//   if (!this.isnotEmpty(section)) {
//     throw new Error("Section is required");
//   }
//   if (!this.isnotEmpty(classTeacher)) {
//     throw new Error("Class teacher is required");
//   }
//   if (!Array.isArray(students)) {
//     throw new Error("Students should be an array");
//   }
//   if (!Array.isArray(subjects)) {
//     throw new Error("Subjects should be an array");
//   }
//   return true;
// }

// static validatePasswordResetData(email, newPassword) {
//   if (!this.isvalidEmail(email)) {
//     throw new Error("Invalid Email format");
//   }
//   if (!this.isvalidPassword(newPassword)) {
//     throw new Error("Password must be at least 8 characters long");
//   }
//   return true;
// }
// static validateLoginData(email, password) {
//   if (!this.isvalidEmail(email)) {
//     throw new Error("Invalid Email format");
//   }
//   if (!this.isnotEmpty(password)) {
//     throw new Error("Password is required");
//   }
//   return true;
// }
