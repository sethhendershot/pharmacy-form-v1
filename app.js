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
    { label: 'Manager Verified Login', type: 'checkbox' },
    { label: 'Manager Signature', type: 'signature' },
    { label: 'Pharmacy Signature', type: 'signature' }
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

// Helper functions for users
const getUsers = () => {
  try {
    return JSON.parse(fs.readFileSync('users.json', 'utf8')) || [];
  } catch {
    return [];
  }
};
const saveUsers = (users) => {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
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
  const users = getUsers();
  console.log('Users loaded:', users);
  const user = users.find(u => u.username === username && u.password === password);
  console.log('Found user:', user);
  if (user) {
    req.session.loggedin = true;
    req.session.username = username;
    req.session.role = user.role;
    res.redirect('/admin');
  } else {
    res.render('login', { error: 'Invalid username or password' });
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
  const entries = getEntries();
  const newEntry = {
    id: Date.now().toString(),
    data,
    submittedAt: new Date().toISOString(),
    status: 'submitted',
    submittedBy: 'employee' // Placeholder
  };
  entries.push(newEntry);
  saveEntries(entries);
  const nextLink = `http://localhost:3000/stage/2/${newEntry.id}`;
  console.log('Email link for manager:', nextLink); // Placeholder for email
  res.render('success', { nextLink });
});

app.get('/stage/:stage/:id', (req, res) => {
  const { stage, id } = req.params;
  const entries = getEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return res.status(404).send('Entry not found');
  // Check if stage matches current status
  if ((stage == 2 && entry.status !== 'submitted') || (stage == 3 && entry.status !== 'manager approved')) {
    return res.status(403).send('Invalid stage for this entry');
  }
  res.render('stage', { stage: parseInt(stage), entry });
});

app.post('/stage/:stage/:id', (req, res) => {
  const { stage, id } = req.params;
  const entries = getEntries();
  const entry = entries.find(e => e.id === id);
  if (!entry) return res.status(404).send('Entry not found');
  
  if (stage == 2) {
    // Manager data
    entry.data = { ...entry.data, ...req.body };
    entry.status = 'manager approved';
    entry.updatedAt = new Date().toISOString();
    const nextLink = `http://localhost:3000/stage/3/${entry.id}`;
    console.log('Email link for director:', nextLink); // Placeholder
    saveEntries(entries);
    res.render('success', { nextLink });
  } else if (stage == 3) {
    // Director decision
    const { decision } = req.body;
    entry.data = { ...entry.data, ...req.body };
    entry.status = decision === 'approved' ? 'director approved' : 'denied';
    entry.updatedAt = new Date().toISOString();
    saveEntries(entries);
    res.render('success', { nextLink: null }); // No next link
  }
});

app.get('/admin', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.redirect('/login');
  res.render('dashboard', { username: req.session.username });
});

app.get('/api/entries', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  res.json(getEntries());
});

app.post('/entries/:id/status', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
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
  if (!req.session.loggedin || req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const entries = getEntries();
  const index = entries.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Entry not found' });
  entries.splice(index, 1);
  saveEntries(entries);
  res.json({ success: true });
});

app.get('/view/:id', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.redirect('/login');
  const entries = getEntries();
  const entry = entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).send('Entry not found');
  res.render('view', { entry });
});

app.get('/settings', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.redirect('/login');
  const users = getUsers();
  res.render('settings', { users });
});

app.post('/settings/users', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.redirect('/login');
  const { username, password, role } = req.body;
  const users = getUsers();
  
  // Check if username already exists
  if (users.find(u => u.username === username)) {
    return res.render('settings', { users, error: 'Username already exists' });
  }
  
  users.push({ username, password, role });
  saveUsers(users);
  res.redirect('/settings');
});

app.delete('/settings/users/:username', (req, res) => {
  if (!req.session.loggedin || req.session.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
  const { username } = req.params;
  const users = getUsers();
  const index = users.findIndex(u => u.username === username);
  if (index === -1) return res.status(404).json({ error: 'User not found' });
  if (username === 'admin') return res.status(403).json({ error: 'Cannot delete admin user' });
  users.splice(index, 1);
  saveUsers(users);
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