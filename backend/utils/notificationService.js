"use strict";

/**
 * Sends an email notification to the developer when a new ticket/issue report is submitted.
 * Supports Resend API (via HTTPS fetch) with graceful fallbacks.
 *
 * Configurable via environment variables:
 * - ADMIN_NOTIFICATION_EMAIL: Target developer email (defaults to tejasholla23@gmail.com)
 * - RESEND_API_KEY: (Optional) Resend API key for instant transactional email delivery
 * - NOTIFICATION_FROM_EMAIL: (Optional) Sender email (defaults to "Email Tracker Alerts <onboarding@resend.dev>")
 */

async function notifyDeveloperOfIssue(report) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "tejasholla23@gmail.com";
  const resendApiKey = process.env.RESEND_API_KEY;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
      <div style="background: #0f172a; padding: 20px 24px; color: #ffffff;">
        <h2 style="margin: 0; font-size: 18px; font-weight: 700; color: #38bdf8;">
          New Ticket / Bug Report Received
        </h2>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8;">
          Email Tracker Support System
        </p>
      </div>

      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #64748b; width: 120px;">User:</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #0f172a;">${report.userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #64748b;">Category:</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a;">
              <span style="display: inline-block; padding: 2px 10px; background: #e0f2fe; color: #0284c7; border-radius: 12px; font-weight: 600; font-size: 12px;">
                ${report.category}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #64748b;">Subject:</td>
            <td style="padding: 8px 0; font-size: 14px; font-weight: 600; color: #0f172a;">${report.subject}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #64748b;">Submitted At:</td>
            <td style="padding: 8px 0; font-size: 13px; color: #64748b;">${new Date(report.createdAt || Date.now()).toLocaleString()}</td>
          </tr>
        </table>

        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 8px;">
            Issue Description:
          </div>
          <div style="font-size: 14px; color: #1e293b; line-height: 1.6; white-space: pre-wrap;">
            ${escapeHtml(report.description)}
          </div>
        </div>

        ${
          report.metadata && (report.metadata.userAgent || report.metadata.screenResolution)
            ? `
          <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
            <strong>Diagnostics:</strong><br />
            Screen: ${report.metadata.screenResolution || "N/A"} | Theme: ${report.metadata.theme || "dark"}<br />
            User-Agent: ${report.metadata.userAgent || "N/A"}
          </div>
        `
            : ""
        }
      </div>

      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px 24px; text-align: center; font-size: 12px; color: #94a3b8;">
        Report ID: <code>${report._id}</code>
      </div>
    </div>
  `;

  if (!resendApiKey) {
    console.log(
      `[ADMIN_NOTIFICATION_SKIPPED] No RESEND_API_KEY configured. Notification for ticket '${report.subject}' was logged to console.`
    );
    return;
  }

  try {
    const fromEmail = process.env.NOTIFICATION_FROM_EMAIL || "Email Tracker <onboarding@resend.dev>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [adminEmail],
        subject: `[Email Tracker Ticket] [${report.category}] ${report.subject}`,
        html: htmlContent,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error("[ADMIN_EMAIL_NOTIFICATION_FAILED]", errData);
    } else {
      console.log(`[ADMIN_EMAIL_NOTIFIED] Email alert sent to ${adminEmail} for report ${report._id}`);
    }
  } catch (error) {
    console.error("[ADMIN_EMAIL_NOTIFICATION_ERROR]", error.message);
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = {
  notifyDeveloperOfIssue,
};
