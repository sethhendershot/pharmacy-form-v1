const express = require('express');
const session = require('express-session');
const fs = require('fs');
require('dotenv').config();

const app = express();
const emailService = require('./services/emailService');

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-key', // Consider moving to .env
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');

app.use('/images', express.static('images'));

// Define checkbox fields that should be converted to boolean
const checkboxFields = [
  'I verify the accuracy of the information above',
  'Manager Verify Accuracy',
  'Manager Verified Login',
  'Employee Agreement',
  'The user has been added to the Security Group'
];

// Function to convert checkbox values from 'on' to true, absence to false
function processCheckboxes(data) {
  checkboxFields.forEach(field => {
    data[field] = data[field] === 'on';
  });
}

// Define the single static form
const STATIC_FORM = {
  id: 'pyxis-request',
  name: 'Pyxis Medication Machine Access Request - Stage 1',
  description: 'Stage 1: Manager provides employee information',
  fields: [
    { label: 'Date', type: 'date', required: true, defaultValue: new Date().toISOString().split('T')[0] },
    { label: 'Primary Unit to be assigned', type: 'select', options: ['unit1', 'unit2', 'unit3'], required: true, defaultValue: 'unit1' },
    { label: 'First Name', type: 'text', required: true, defaultValue: 'John' },
    { label: 'Middle Initial', type: 'text', defaultValue: 'A' },
    { label: 'Last Name', type: 'text', required: true, defaultValue: 'Doe' },
    { label: 'Trinity Employee ID Number', type: 'text', required: true, defaultValue: '123456' },
    { label: 'Email Address', type: 'email', required: true, defaultValue: 'john.doe@trinityhealth.org' },
    { label: 'Professional Credentials', type: 'text', placeholder: 'RN, LPN, MD, RPh, CPhT, etc', required: true, defaultValue: 'RN' },
    { label: 'User Type', type: 'select', options: ['Trinity Employee', 'Contract Staff of Locum Anesthesia Provider'], required: true, defaultValue: 'Trinity Employee' },
    { label: 'Job Title/ User Role', type: 'select', options: [
      'AEMT', 'Anesthesiologist', 'CRNA', 'CRNA Student', 'EMT', 'LIP/Provider', 'LPN', 
      'Nurse Manager/House Supervisor', 'Nursing Instructor', 'Ophthalmic Tech', 'Paramedic', 
      'Perfusionist', 'Pharmacist', 'Pharmacy Tech', 'Pharmacy Tech in Training', 
      'Radiology/Ultrasound Tech', 'Respiratory Therapist', 'Respiratory Therapist - Sleep lab only', 
      'RN (charge)', 'RN (staff)', 'Surgical Assistant'
    ], required: true, defaultValue: 'RN (staff)' },
    { label: 'I verify the accuracy of the information above', type: 'checkbox', required: true, defaultValue: true },
    { label: 'Signature', type: 'signature', required: true, defaultValue: 'Test Signature' }
  ]
};

// Helper functions for entries
const getEntries = () => {
  try {
    return JSON.parse(fs.readFileSync('forms.json', 'utf8')) || [];
  } catch {
    return [];
  }
};
const saveEntries = (entries) => {
  fs.writeFileSync('forms.json', JSON.stringify(entries, null, 2));
};

app.get('/', (req, res) => {
  res.render('submit', { form: STATIC_FORM });
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  console.log('Login attempt with password');
  if (password === 'admin123') {
    req.session.loggedin = true;
    req.session.username = 'admin';
    res.redirect('/admin');
  } else {
    res.render('login', { error: 'Invalid password' });
  }
});

app.get('/api/forms', (req, res) => {
  res.json(STATIC_FORM);
});

app.get('/submit', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  res.render('submit', { form: STATIC_FORM });
});

app.post('/submit', (req, res) => {
  const data = req.body; // Form data as object
  processCheckboxes(data);
  const entries = getEntries();
  const newEntry = {
    id: Date.now().toString(),
    stage: 1,
    data,
    submittedAt: new Date().toISOString(),
    status: 'stage 1 completed',
  };
  entries.push(newEntry);
  saveEntries(entries);
  
  // Send email to employee for approval
  const employeeName = `${newEntry.data['First Name']} ${newEntry.data['Last Name']}`;
  const employeeEmail = newEntry.data['Email Address'];
  const approvalLink = `${process.env.BASE_URL}/stage/2/${newEntry.id}`;
  const emailTemplate = emailService.getEmployeeApprovalEmail(employeeName, approvalLink);
  if (employeeEmail) {
    emailService.sendEmail(employeeEmail, emailTemplate.subject, emailTemplate.html);
  } else {
    console.log('No email address found for employee notification');
  }
  
  res.render('overview', { entry: newEntry, nextLink: approvalLink });
});

app.get('/stage/:stage/:id', (req, res) => {
  const { stage, id } = req.params;
  const entries = getEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return res.status(404).send('Entry not found');
  // Check if stage matches current status
  if (stage == 2 && entry.status !== 'stage 1 completed') {
    return res.status(403).send('Invalid stage for this entry');
  }
  if (stage == 3 && entry.status !== 'stage 2 completed') {
    return res.status(403).send('Invalid stage for this entry');
  }
  if (stage == 4 && entry.status !== 'stage 3 completed') {
    return res.status(403).send('Invalid stage for this entry');
  }
  if (stage == 5 && entry.status !== 'stage 4 completed') {
    return res.status(403).send('Invalid stage for this entry');
  }
  if (stage == 4) {
    res.render('stage', { stage: parseInt(stage), entry });
  } else if (stage == 5) {
    res.render('stage', { stage: parseInt(stage), entry });
  } else {
    res.render('stage', { stage: parseInt(stage), entry });
  }
});

app.post('/stage/:stage/:id', (req, res) => {
  const { stage, id } = req.params;
  const entries = getEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return res.status(404).send('Entry not found');
  
  if (stage == 2) {
    // Employee completion
    const newData = req.body;
    processCheckboxes(newData);
    entry.data = { ...entry.data, ...newData };
    entry.stage = 2;
    entry.status = 'stage 2 completed';
    entry.updatedAt = new Date().toISOString();
    const nextLink = `${process.env.BASE_URL}/stage/3/${entry.id}`;
    console.log('Email link for pharmacy director:', nextLink); // Keep for logging
    
    // Send email to director
    const employeeName = `${entry.data['First Name']} ${entry.data['Last Name']}`;
    const emailTemplate = emailService.getDirectorApprovalEmail(employeeName, nextLink);
    emailService.sendEmail(process.env.DIRECTOR_EMAIL, emailTemplate.subject, emailTemplate.html);
    
    saveEntries(entries);
    res.render('success', { nextLink });
  } else if (stage == 1) {
    // Stage 1 submission
    const newData = req.body;
    processCheckboxes(newData);
    entry.data = { ...entry.data, ...newData };
    entry.status = 'stage 1 completed';
    entry.updatedAt = new Date().toISOString();
    saveEntries(entries);
    res.render('overview', { entry, nextLink: `/stage/2/${entry.id}` });
  } else if (stage == 3) {
    // Pharmacy Director approval
    const newData = req.body;
    processCheckboxes(newData);
    entry.data = { ...entry.data, ...newData };
    entry.status = 'stage 3 completed';
    entry.updatedAt = new Date().toISOString();
    
    // Send email to DTG
    const employeeName = `${entry.data['First Name']} ${entry.data['Last Name']}`;
    const nextLink = `${process.env.BASE_URL}/stage/4/${entry.id}`;
    const emailTemplate = emailService.getDTGNotificationEmail(employeeName, nextLink);
    emailService.sendEmail(process.env.DTG_EMAIL, emailTemplate.subject, emailTemplate.html);
    
    saveEntries(entries);
    res.render('success', { nextLink: nextLink });
  } else if (stage == 4) {
    // DTG addition
    const newData = req.body;
    processCheckboxes(newData);
    entry.data = { ...entry.data, ...newData };
    entry.status = 'stage 4 completed';
    entry.updatedAt = new Date().toISOString();
    saveEntries(entries);
    res.render('success', { nextLink: `${process.env.BASE_URL}/stage/5/${entry.id}` });
  } else if (stage == 5) {
    // Completion
    const newData = req.body;
    processCheckboxes(newData);
    entry.data = { ...entry.data, ...newData };
    entry.status = 'stage 5 completed';
    entry.updatedAt = new Date().toISOString();
    
    // Send completion email to the employee
    const employeeName = `${entry.data['First Name']} ${entry.data['Last Name']}`;
    const employeeEmail = entry.data['Email Address'];
    const emailTemplate = emailService.getCompletionEmail(employeeName);
    if (employeeEmail) {
      emailService.sendEmail(employeeEmail, emailTemplate.subject, emailTemplate.html);
    } else {
      console.log('No email address found for completion notification');
    }
    
    saveEntries(entries);
    res.render('success', { nextLink: null });
  }
});

app.get('/admin', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  res.render('dashboard', { username: req.session.username });
});

app.get('/api/entries', (req, res) => {
  if (!req.session.loggedin) return res.status(403).json({ error: 'Access denied' });
  res.json(getEntries());
});

app.post('/entries/:id/status', (req, res) => {
  if (!req.session.loggedin) return res.status(403).json({ error: 'Access denied' });
  const { status } = req.body;
  const entries = getEntries();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  saveEntries(entries);
  res.json({ success: true });
});

app.post('/entries/:id/resend-email', (req, res) => {
  if (!req.session.loggedin) return res.status(403).json({ error: 'Access denied' });
  const entries = getEntries();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });

  const { emailType } = req.body;
  const employeeName = `${entry.data['First Name']} ${entry.data['Last Name']}`;

  let emailResult = { success: false, error: 'Invalid email type' };

  // Send email based on specified type
  if (emailType === 'director') {
    // Send director approval email
    const approvalLink = `${process.env.BASE_URL}/stage/3/${entry.id}`;
    const emailTemplate = emailService.getDirectorApprovalEmail(employeeName, approvalLink);
    emailResult = emailService.sendEmail(process.env.DIRECTOR_EMAIL, emailTemplate.subject, emailTemplate.html);
  } else if (emailType === 'dtg') {
    // Send DTG notification email
    const completionLink = `${process.env.BASE_URL}/stage/4/${entry.id}`;
    const emailTemplate = emailService.getDTGNotificationEmail(employeeName, completionLink);
    emailResult = emailService.sendEmail(process.env.DTG_EMAIL, emailTemplate.subject, emailTemplate.html);
  } else if (emailType === 'completion') {
    // Send completion email to employee
    const employeeEmail = entry.data['Email Address'];
    if (employeeEmail) {
      const emailTemplate = emailService.getCompletionEmail(employeeName);
      emailResult = emailService.sendEmail(employeeEmail, emailTemplate.subject, emailTemplate.html);
    } else {
      emailResult = { success: false, error: 'No email address found for employee' };
    }
  }

  if (emailResult.success) {
    res.json({ success: true });
  } else {
    res.json({ success: false, error: emailResult.error || emailResult.message });
  }
});

app.delete('/entries/:id', (req, res) => {
  if (!req.session.loggedin) return res.status(403).json({ error: 'Access denied' });
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Entry not found' });
  entries.splice(index, 1);
  saveEntries(entries);
  res.json({ success: true });
});

app.get('/view/:id', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  const entries = getEntries();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).send('Entry not found');
  res.render('view', { entry });
});

app.get('/test-email', async (req, res) => {
  try {
    const testResult = await emailService.testEmailConfiguration();
    res.json(testResult);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});