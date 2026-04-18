const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');

class EmailService {
  constructor() {
    this.clientId = process.env.AZURE_CLIENT_ID;
    this.clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.tenantId = process.env.AZURE_TENANT_ID;
    this.fromEmail = process.env.FROM_EMAIL;

    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      console.warn('Azure AD credentials not configured. Email functionality will be disabled.');
      this.enabled = false;
      return;
    }

    this.enabled = true;

    // Create Azure AD credential
    this.credential = new ClientSecretCredential(
      this.tenantId,
      this.clientId,
      this.clientSecret
    );

    // Initialize Microsoft Graph client
    this.client = Client.init({
      authProvider: (done) => {
        this.credential.getToken('https://graph.microsoft.com/.default')
          .then((token) => {
            done(null, token.token);
          })
          .catch((error) => {
            console.error('Error getting token:', error);
            done(error, null);
          });
      }
    });
  }

  async sendEmail(to, subject, htmlContent, cc = null) {
    if (!this.enabled) {
      console.log(`[EMAIL DISABLED] Would send email to ${to}: ${subject}`);
      return { success: false, message: 'Email service disabled' };
    }

    try {
      const message = {
        subject: subject,
        body: {
          contentType: 'HTML',
          content: htmlContent
        },
        toRecipients: [
          {
            emailAddress: {
              address: to
            }
          }
        ]
      };

      if (cc) {
        message.ccRecipients = [
          {
            emailAddress: {
              address: cc
            }
          }
        ];
      }

      const sendMail = {
        message: message,
        saveToSentItems: 'true'
      };

      await this.client.api('/me/sendMail').post(sendMail);
      console.log(`Email sent successfully to ${to}: ${subject}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  // Email templates
  getDirectorApprovalEmail(employeeName, approvalLink) {
    return {
      subject: `Pyxis Access Request - Director Approval Required for ${employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Pyxis Access Request - Director Approval Required</h2>
          <p>A Pyxis access request has been submitted for <strong>${employeeName}</strong> and requires your approval.</p>
          <p>Please review and approve the request by clicking the link below:</p>
          <p><a href="${approvalLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review Request</a></p>
          <p>If you have any questions, please contact the pharmacy team.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message from the Pyxis Access Request System.</p>
        </div>
      `
    };
  }

  getDTGNotificationEmail(employeeName, completionLink) {
    return {
      subject: `Pyxis Access Request - DTG Action Required for ${employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Pyxis Access Request - DTG Action Required</h2>
          <p>A Pyxis access request for <strong>${employeeName}</strong> has been approved and requires DTG action.</p>
          <p>Please complete the DTG setup by clicking the link below:</p>
          <p><a href="${completionLink}" style="background-color: #28a745; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Complete Setup</a></p>
          <p>The user needs to be added to the Pyxis ES security group.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message from the Pyxis Access Request System.</p>
        </div>
      `
    };
  }

  getCompletionEmail(employeeName, requestorEmail) {
    return {
      subject: `Pyxis Access Request Completed for ${employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Pyxis Access Request Completed</h2>
          <p>The Pyxis access request for <strong>${employeeName}</strong> has been completed successfully.</p>
          <p>The user has been added to the Pyxis ES system and security group.</p>
          <p>Please allow 24-48 hours for the changes to take effect.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message from the Pyxis Access Request System.</p>
        </div>
      `
    };
  }
}

module.exports = new EmailService();