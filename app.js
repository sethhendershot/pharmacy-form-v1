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

// Load roles from .env
const roles = process.env.ROLES ? process.env.ROLES.split(',').map(r => r.trim()) : [];

// Define the single static form
const STATIC_FORM = {
  id: 'pyxis-request',
  name: 'Pyxis Medication Machine Access Request',
  description: 'Request access to Pyxis medication machine',
  fields: [
    { label: 'User Type', type: 'select', options: ['Trinity Employee', 'Contract Staff or Locum Anesthesia Provider'], required: true },
    { label: 'First Name', type: 'text', required: true },
    { label: 'Middle Initial', type: 'text' },
    { label: 'Last Name', type: 'text', required: true },
    { label: 'Professional Credentials', type: 'text', required: true },
    { label: 'Primary Unit to be assigned', type: 'text', required: true },
    { label: 'Pyxis online tutorial completion date', type: 'date' },
    { label: 'Pyxis Policy/Procedure review date', type: 'date' },
    { label: 'Employee Signature', type: 'signature', required: true },
    { label: 'Manager Verify Accuracy', type: 'checkbox' },
    { label: 'Manager Requested Access', type: 'checkbox' },
    { label: 'Manager Verified Login', type: 'checkbox' },
    { label: 'Manager Signature', type: 'signature' },
    { label: 'Pharmacy Signature', type: 'signature' }
  ],
  entries: []
};

// Helper functions for forms
const getForms = () => [STATIC_FORM]; // Return array with single form
const saveForms = (forms) => {
  // Since static, just update entries
  STATIC_FORM.entries = forms[0].entries;
  fs.writeFileSync('forms.json', JSON.stringify(forms, null, 2));
};

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('Login attempt:', { username, password });
  console.log('Env:', { APP_USERNAME: process.env.APP_USERNAME, PASSWORD: process.env.PASSWORD });
  if (username === process.env.APP_USERNAME && password === process.env.PASSWORD) {
    req.session.loggedin = true;
    req.session.username = username;
    req.session.role = 'admin';
    res.redirect('/');
  } else {
    res.render('login', { error: 'Invalid username or password' });
  }
});

app.get('/api/forms', (req, res) => {
  res.json(getForms());
});

app.get('/submit', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  res.render('submit', { form: STATIC_FORM });
});

app.post('/submit', (req, res) => {
  const data = req.body; // Form data as object
  const forms = getForms();
  const form = forms[0]; // Single form
  const newEntry = {
    id: Date.now().toString(),
    data,
    submittedAt: new Date().toISOString(),
    status: 'submitted',
    submittedBy: 'employee' // Placeholder
  };
  form.entries.push(newEntry);
  saveForms(forms);
  const nextLink = `http://localhost:3000/stage/2/${newEntry.id}`;
  console.log('Email link for manager:', nextLink); // Placeholder for email
  res.render('success', { nextLink });
});

app.get('/stage/:stage/:id', (req, res) => {
  const { stage, id } = req.params;
  const forms = getForms();
  const entry = forms[0].entries.find(e => e.id === id);
  if (!entry) return res.status(404).send('Entry not found');
  // Check if stage matches current status
  if ((stage == 2 && entry.status !== 'submitted') || (stage == 3 && entry.status !== 'manager approved')) {
    return res.status(403).send('Invalid stage for this entry');
  }
  res.render('stage', { stage: parseInt(stage), entry });
});

app.post('/stage/:stage/:id', (req, res) => {
  const { stage, id } = req.params;
  const forms = getForms();
  const entry = forms[0].entries.find(e => e.id === id);
  if (!entry) return res.status(404).send('Entry not found');
  
  if (stage == 2) {
    // Manager data
    entry.data = { ...entry.data, ...req.body };
    entry.status = 'manager approved';
    entry.updatedAt = new Date().toISOString();
    const nextLink = `http://localhost:3000/stage/3/${entry.id}`;
    console.log('Email link for director:', nextLink); // Placeholder
    saveForms(forms);
    res.render('success', { nextLink });
  } else if (stage == 3) {
    // Director decision
    const { decision } = req.body;
    entry.data = { ...entry.data, ...req.body };
    entry.status = decision === 'approved' ? 'director approved' : 'denied';
    entry.updatedAt = new Date().toISOString();
    saveForms(forms);
    res.render('success', { nextLink: null }); // No next link
  }
});

app.get('/admin', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.redirect('/');
  res.render('dashboard');
});

app.get('/api/entries', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const forms = getForms();
  res.json(forms[0].entries || []);
});

app.post('/entries/:id/status', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const { status } = req.body;
  const forms = getForms();
  const entry = forms[0].entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  entry.status = status;
  entry.updatedAt = new Date().toISOString();
  saveForms(forms);
  res.json({ success: true });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});