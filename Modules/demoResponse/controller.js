const Validator = require("../../helpers/validators");
const DemoResponseModel = require("./model");
const { sendEmail } = require("../../helpers/sendemail");
const axios = require("axios");

exports.submitDemoRequest = async (req, res) => {
  try {
    const { name, company, email, message, requestDemo } = req.body || {};

    const rules = {
      name: "required|string",
      company: "required|string",
      email: "required|email",
      message: "string",
      requestDemo: "boolean",
    };
    const validator = new Validator({ name, company, email, message, requestDemo }, rules);
    await validator.validate();

    const demoResponse = await DemoResponseModel.create({
      name,
      company,
      email,
      message,
      requestDemo: !!requestDemo,
    });

    // Send Email Notification
    const recipient = process.env.DEMO_REQUEST_RECIPIENT || process.env.EMAIL_USER;
    if (recipient) {
      try {
        await sendEmail("demoRequest.html", recipient, {
          name,
          company,
          email,
          message: message || "No message provided",
          requestDemo: requestDemo ? "Yes" : "No",
        }, { fromFile: true, subject: "New Demo Request - PIL Platform" });
      } catch (err) {
        console.error("Failed to send demo request email:", err.message);
      }
    }

    // Send Slack Notification (Optional - if SLACK_WEBHOOK_URL is set)
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await axios.post(process.env.SLACK_WEBHOOK_URL, {
          text: `🚀 *New Demo Request Received!*\n\n*Name:* ${name}\n*Company:* ${company}\n*Email:* ${email}\n*Message:* ${message || "N/A"}\n*Demo Requested:* ${requestDemo ? "✅ Yes" : "❌ No"}`,
        });
      } catch (err) {
        console.error("Failed to send slack notification:", err.message);
      }
    }

    return res.status(201).json({
      status: true,
      message: "Your request has been submitted successfully.",
      data: demoResponse,
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
