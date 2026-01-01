const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

// Brevo SMTP transport configuration
const smtpPort = parseInt(process.env.SMTP_PORT || '587');
const isSecure = smtpPort === 465; // Port 465 uses SSL, 587 uses STARTTLS

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER || 'smtp-relay.brevo.com',
  port: smtpPort,
  secure: isSecure, // true for 465, false for other ports (587 uses STARTTLS)
  requireTLS: !isSecure, // Force TLS for non-SSL ports
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_KEY,
  },
  pool: true,
  maxConnections: 5,
  connectionTimeout: 60000, // 60 seconds
  socketTimeout: 60000, // 60 seconds
  greetingTimeout: 30000, // 30 seconds
  tls: {
    rejectUnauthorized: false // Accept self-signed certificates if needed
  }
});

/**
 * Send a simple email using Brevo API (preferred) or SMTP (fallback)
 * Returns { success: boolean, error?: string }
 */
const sendEmail = async (to, subject, text) => {
  // Format from address with name if available
  const fromEmail = process.env.FROM_EMAIL || process.env.BREVO_SMTP_USER;
  const fromName = process.env.FROM_NAME || 'Garage Systems';

  // Try Brevo HTTP API first (more reliable, no IP whitelisting needed)
  if (process.env.BREVO_API_KEY) {
    try {
      const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: fromName,
            email: fromEmail,
          },
          to: [{ email: to }],
          subject: subject,
          textContent: text,
        }),
      });

      if (resp.ok) {
        console.log("Email (Brevo API) sent to", to);
        return { success: true };
      }

      const errText = await resp.text();
      console.error("Brevo API error:", errText);
      // Fall through to SMTP if API fails
    } catch (e) {
      console.error("Brevo API request failed:", e.message);
      // Fall through to SMTP if API fails
    }
  }

  // Fallback to SendGrid API if configured
  if (process.env.SENDGRID_API_KEY) {
    try {
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

  // Fallback to SMTP
  const from = `${fromName} <${fromEmail}>`;
  const mailOptions = {
    from,
    to,
    subject,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email (SMTP) sent to", to);
    return { success: true };
  } catch (error) {
    console.error("Email sending error:", error);
    console.error("SMTP Config:", {
      host: process.env.SMTP_SERVER || 'smtp-relay.brevo.com',
      port: process.env.SMTP_PORT || '587',
      user: process.env.BREVO_SMTP_USER ? '***configured***' : 'NOT SET'
    });
    
    // If connection timeout on port 587, suggest trying port 465
    if (error.code === 'ETIMEDOUT' && (process.env.SMTP_PORT === '587' || !process.env.SMTP_PORT)) {
      console.error("Connection timeout on port 587. Try setting SMTP_PORT=465 or use BREVO_API_KEY instead");
    }
    
    return { success: false, error: error && error.message ? error.message : String(error) };
  }
};

module.exports = sendEmail;
