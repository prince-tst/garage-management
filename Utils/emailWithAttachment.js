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
  maxConnections: 5,
  maxMessages: 100,
  connectionTimeout: 15000,
  socketTimeout: 20000,
});

// Send email with PDF attachment
const sendEmailWithAttachment = async (to, subject, text, pdfBuffer, filename = "invoice.pdf") => {
  // Format from address with name if available
  const fromEmail = process.env.FROM_EMAIL || process.env.BREVO_SMTP_USER;
  const fromName = process.env.FROM_NAME || 'Garage Systems';
  const from = `${fromName} <${fromEmail}>`;

  const mailOptions = {
    from,
    to,
    subject,
    text,
    attachments: [
      {
        filename: filename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  };

  // Fallback to SendGrid API if configured (optional, can be removed if not needed)
  if (process.env.SENDGRID_API_KEY) {
    try {
      const fromEmail = process.env.FROM_EMAIL || process.env.BREVO_SMTP_USER;
      const base64 = pdfBuffer.toString('base64');
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
          attachments: [
            {
              content: base64,
              filename,
              type: "application/pdf",
              disposition: "attachment"
            }
          ]
        }),
      });
      if (resp.ok) {
        console.log("Email with attachment (SendGrid) sent to", to);
        return { success: true, message: "Email sent successfully" };
      }
      const errText = await resp.text();
      return { success: false, error: errText };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email with PDF attachment sent to", to);
    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error && error.message ? error.message : String(error) };
  }
};

// Send simple email (existing functionality)
const sendEmail = async (to, subject, text) => {
  // Format from address with name if available
  const fromEmail = process.env.FROM_EMAIL || process.env.BREVO_SMTP_USER;
  const fromName = process.env.FROM_NAME || 'Garage Systems';
  const from = `${fromName} <${fromEmail}>`;

  const mailOptions = {
    from,
    to,
    subject,
    text
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent to", to);
    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    console.error("Email sending error:", error);
    return { success: false, error: error && error.message ? error.message : String(error) };
  }
};

module.exports = { sendEmailWithAttachment, sendEmail };
