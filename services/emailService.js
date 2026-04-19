const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');

class EmailService {
  constructor() {
    this.clientId = process.env.AZURE_CLIENT_ID;
    this.clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.tenantId = process.env.AZURE_TENANT_ID;
    this.fromEmail = process.env.FROM_EMAIL;

    console.log('[EMAIL SERVICE] Initializing...');
    console.log(`[EMAIL SERVICE] Client ID configured: ${!!this.clientId}`);
    console.log(`[EMAIL SERVICE] Client Secret configured: ${!!this.clientSecret}`);
    console.log(`[EMAIL SERVICE] Tenant ID configured: ${!!this.tenantId}`);
    console.log(`[EMAIL SERVICE] From Email: ${this.fromEmail || 'not set'}`);

    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      console.warn('[EMAIL SERVICE] Azure AD credentials not fully configured. Email functionality will be disabled.');
      console.warn(`[EMAIL SERVICE] Missing: ${[
        !this.clientId && 'AZURE_CLIENT_ID',
        !this.clientSecret && 'AZURE_CLIENT_SECRET', 
        !this.tenantId && 'AZURE_TENANT_ID'
      ].filter(Boolean).join(', ')}`);
      this.enabled = false;
      return;
    }

    this.enabled = true;
    console.log('[EMAIL SERVICE] Service enabled and ready to send emails');

    // Create Azure AD credential
    try {
      this.credential = new ClientSecretCredential(
        this.tenantId,
        this.clientId,
        this.clientSecret
      );
      console.log('[EMAIL SERVICE] Azure credential created successfully');
    } catch (error) {
      console.error('[EMAIL SERVICE] Failed to create Azure credential:', error);
      this.enabled = false;
      return;
    }

    // Initialize Microsoft Graph client
    try {
      this.client = Client.init({
        authProvider: (done) => {
          console.log('[EMAIL SERVICE] Requesting access token...');
          this.credential.getToken('https://graph.microsoft.com/.default')
            .then((token) => {
              console.log('[EMAIL SERVICE] Access token obtained successfully');
              done(null, token.token);
            })
            .catch((error) => {
              console.error('[EMAIL SERVICE] Error getting access token:', error);
              done(error, null);
            });
        }
      });
      console.log('[EMAIL SERVICE] Microsoft Graph client initialized');
    } catch (error) {
      console.error('[EMAIL SERVICE] Failed to initialize Graph client:', error);
      this.enabled = false;
    }
  }

  async testEmailConfiguration() {
    console.log('[EMAIL TEST] Testing email service configuration...');

    if (!this.enabled) {
      console.log('[EMAIL TEST] Service is disabled - cannot test');
      return { success: false, message: 'Email service disabled' };
    }

    try {
      console.log('[EMAIL TEST] Testing token acquisition...');
      const token = await this.credential.getToken('https://graph.microsoft.com/.default');
      console.log('[EMAIL TEST] Token acquired successfully');

      console.log('[EMAIL TEST] Testing basic Graph API connectivity...');
      // For app-only authentication, let's test a simple endpoint that doesn't require user context
      // We'll test the service account's mailbox settings to verify we have access
      const mailboxSettings = await this.client.api(`/users/${this.fromEmail}/mailboxSettings`).get();
      console.log('[EMAIL TEST] Graph API connection successful - mailbox accessible');

      return {
        success: true,
        message: 'Email service configuration is working - Graph API accessible',
        user: 'Service Account',
        email: this.fromEmail
      };
    } catch (error) {
      console.error('[EMAIL TEST] Configuration test failed:', error);

      // If mailbox settings fail, let's try a different approach - just verify token works
      if (error.code === 'Authorization_RequestDenied' || error.statusCode === 403) {
        console.log('[EMAIL TEST] Mailbox access denied, but token acquisition works. Email sending will be tested during actual use.');
        return {
          success: true,
          message: 'Token acquisition works, but mailbox permissions may need verification. Email sending will be tested during actual use.',
          user: 'Service Account',
          email: this.fromEmail,
          warning: 'Mailbox permissions may be insufficient - test with actual email sending'
        };
      }

      return {
        success: false,
        error: error.message,
        details: error
      };
    }
  }

  async sendEmail(to, subject, htmlContent, cc = null) {
    console.log(`[EMAIL SERVICE] Attempting to send email to: ${to}`);
    console.log(`[EMAIL SERVICE] Subject: ${subject}`);
    console.log(`[EMAIL SERVICE] Service enabled: ${this.enabled}`);

    if (!this.enabled) {
      console.log(`[EMAIL DISABLED] Would send email to ${to}: ${subject}`);
      return { success: false, message: 'Email service disabled - check Azure AD configuration' };
    }

    try {
      console.log('[EMAIL SERVICE] Building email message...');
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
        console.log(`[EMAIL SERVICE] Adding CC recipient: ${cc}`);
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

      console.log('[EMAIL SERVICE] Sending email via Microsoft Graph API...');
      console.log(`[EMAIL SERVICE] API endpoint: /users/${this.fromEmail}/sendMail`);
      console.log(`[EMAIL SERVICE] Message details:`, {
        to: to,
        subject: subject,
        hasCC: !!cc,
        contentLength: htmlContent.length
      });

      await this.client.api(`/users/${this.fromEmail}/sendMail`).post(sendMail);
      console.log(`[EMAIL SUCCESS] Email sent successfully to ${to}: ${subject}`);
      return { success: true };
    } catch (error) {
      console.error(`[EMAIL ERROR] Failed to send email to ${to}:`, error);
      console.error(`[EMAIL ERROR] Error details:`, {
        message: error.message,
        statusCode: error.statusCode,
        code: error.code,
        stack: error.stack
      });
      return { success: false, error: error.message, details: error };
    }
  }

  // Email templates
  getEmployeeApprovalEmail(employeeName, approvalLink, baseUrl) {
    return {
      subject: `Pyxis Access Request - Your Approval Required for ${employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${baseUrl}/images/trinity-health-banner.png" alt="Trinity Health Banner" style="max-width: 200px;">
          </div>
          <h2>Pyxis Access Request - Your Approval Required</h2>
          <p>A Pyxis access request has been submitted for you (<strong>${employeeName}</strong>) and requires your approval.</p>
          <p>Please review the information and approve the request by clicking the link below:</p>
          <p><a href="${approvalLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review and Approve Request</a></p>
          <p>If you have any questions, please contact your manager or the pharmacy team.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">This is an automated message from the Pyxis Access Request System.</p>
        </div>
      `
    };
  }

  getDirectorApprovalEmail(employeeName, approvalLink, baseUrl) {
    return {
      subject: `Pyxis Access Request - Director Approval Required for ${employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${baseUrl}/images/trinity-health-banner.png" alt="Trinity Health Banner" style="max-width: 200px;">
          </div>
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

  getDTGNotificationEmail(employeeName, completionLink, baseUrl) {
    return {
      subject: `Pyxis Access Request - DTG Action Required for ${employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${baseUrl}/images/trinity-health-banner.png" alt="Trinity Health Banner" style="max-width: 200px;">
          </div>
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

  getCompletionEmail(employeeName, requestorEmail, baseUrl) {
    return {
      subject: `Pyxis Access Request Completed for ${employeeName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="${baseUrl}/images/trinity-health-banner.png" alt="Trinity Health Banner" style="max-width: 200px;">
          </div>
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