const express = require('express');
const session = require('express-session');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-key', // Consider moving to .env
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');

// Define checkbox fields that should be converted to boolean
const checkboxFields = [
  'I verify the accuracy of the information above',
  'Employee Verify Accuracy',
  'Manager Verify Accuracy',
  'Manager Verified Login'
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
    { label: 'Date', type: 'date', required: true },
    { label: 'Primary Unit to be assigned', type: 'select', options: ['unit1', 'unit2', 'unit3'], required: true },
    { label: 'First Name', type: 'text', required: true },
    { label: 'Middle Initial', type: 'text' },
    { label: 'Last Name', type: 'text', required: true },
    { label: 'Trinity Employee ID Number', type: 'text', required: true },
    { label: 'Professional Credentials', type: 'text', placeholder: 'RN, LPN, MD, RPh, CPhT, etc', required: true },
    { label: 'User Type', type: 'select', options: ['Trinity Employee', 'Contract Staff of Locum Anesthesia Provider'], required: true },
    { label: 'Job Title/ User Role', type: 'select', options: [
      'AEMT', 'Anesthesiologist', 'CRNA', 'CRNA Student', 'EMT', 'LIP/Provider', 'LPN', 
      'Nurse Manager/House Supervisor', 'Nursing Instructor', 'Ophthalmic Tech', 'Paramedic', 
      'Perfusionist', 'Pharmacist', 'Pharmacy Tech', 'Pharmacy Tech in Training', 
      'Radiology/Ultrasound Tech', 'Respiratory Therapist', 'Respiratory Therapist - Sleep lab only', 
      'RN (charge)', 'RN (staff)', 'Surgical Assistant'
    ], required: true },
    { label: 'I verify the accuracy of the information above', type: 'checkbox', required: true },
    { label: 'Signature', type: 'signature', required: true }
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
    status: 'stage1 completed',
  };
  entries.push(newEntry);
  saveEntries(entries);
  res.render('overview', { entry: newEntry, nextLink: `/stage/2/${newEntry.id}` });
});

app.get('/stage/:stage/:id', (req, res) => {
  const { stage, id } = req.params;
  const entries = getEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return res.status(404).send('Entry not found');
  // Check if stage matches current status
  if (stage == 2 && entry.status !== 'stage1 completed') {
    return res.status(403).send('Invalid stage for this entry');
  }
  if (stage == 3 && entry.status !== 'Employee') {
    return res.status(403).send('Invalid stage for this entry');
  }
  if (stage == 4 && entry.status !== 'Director') {
    return res.status(403).send('Invalid stage for this entry');
  }
  if (stage == 5 && entry.status !== 'DTG') {
    return res.status(403).send('Invalid stage for this entry');
  }
  if (stage == 4) {
    res.render('stage4', { stage: parseInt(stage), entry });
  } else if (stage == 5) {
    res.render('stage5', { stage: parseInt(stage), entry });
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
    entry.status = 'Employee';
    entry.updatedAt = new Date().toISOString();
    const nextLink = `http://localhost:3000/stage/3/${entry.id}`;
    console.log('Email link for pharmacy director:', nextLink); // Placeholder
    saveEntries(entries);
    res.render('success', { nextLink });
  } else if (stage == 1) {
    // Stage 1 submission
    const newData = req.body;
    processCheckboxes(newData);
    entry.data = { ...entry.data, ...newData };
    entry.status = 'stage1 completed';
    entry.updatedAt = new Date().toISOString();
    saveEntries(entries);
    res.render('overview', { entry, nextLink: `/stage/2/${entry.id}` });
  } else if (stage == 3) {
    // Pharmacy Director approval
    const newData = req.body;
    processCheckboxes(newData);
    entry.data = { ...entry.data, ...newData };
    entry.status = 'Director';
    entry.updatedAt = new Date().toISOString();
    saveEntries(entries);
    res.render('success', { nextLink: `/stage/4/${entry.id}` });
  } else if (stage == 4) {
    // DTG addition
    entry.status = 'DTG';
    entry.updatedAt = new Date().toISOString();
    saveEntries(entries);
    res.render('success', { nextLink: `/stage/5/${entry.id}` });
  } else if (stage == 5) {
    // Completion
    entry.status = 'Completed';
    entry.updatedAt = new Date().toISOString();
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

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});