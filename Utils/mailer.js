const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

// Brevo SMTP transport configuration
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER || 'smtp-relay.brevo.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // true for 465, false for other ports (587 uses STARTTLS)
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_KEY,
  },
  pool: true,
  maxConnections: 5
});

/**
 * Send a simple email
 * Returns { success: boolean, error?: string }
 */
const sendEmail = async (to, subject, text) => {
  // Format from address with name if available
  const fromEmail = process.env.FROM_EMAIL || process.env.BREVO_SMTP_USER;
  const fromName = process.env.FROM_NAME || 'Garage Systems';
  const from = `${fromName} <${fromEmail}>`;

  const mailOptions = {
    from,
    to,
    subject,
    text,
  };

  // Fallback to SendGrid API if configured (optional, can be removed if not needed)
  if (process.env.SENDGRID_API_KEY) {
    try {
      const fromEmail = process.env.FROM_EMAIL || process.env.BREVO_SMTP_USER;
      const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: fromEmail },
          subject,
          content: [{ type: "text/plain", value: text }],
        }),
      });
      if (resp.ok) {
        console.log("Email (SendGrid) sent to", to);
        return { success: true };
      }
      const errText = await resp.text();
      return { success: false, error: errText };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent to", to);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error && error.message ? error.message : String(error) };
  }
};

module.exports = sendEmail;
