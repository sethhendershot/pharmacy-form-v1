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

// Helper functions for forms
const getForms = () => {
  try {
    return JSON.parse(fs.readFileSync('forms.json', 'utf8'));
  } catch (err) {
    return [];
  }
};

const saveForms = (forms) => {
  fs.writeFileSync('forms.json', JSON.stringify(forms, null, 2));
};

app.get('/', (req, res) => {
  if (req.session.loggedin) {
    res.render('dashboard', { username: req.session.username });
  } else {
    res.redirect('/login');
  }
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

app.get('/forms/new', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  res.render('form', { editing: false });
});

app.post('/forms', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  const { name, description } = req.body;
  const forms = getForms();
  const newForm = {
    id: Date.now().toString(),
    name,
    description,
    fields: [], // Placeholder for future
    entries: [], // For data entries
    createdAt: new Date().toISOString()
  };
  forms.push(newForm);
  saveForms(forms);
  res.redirect('/');
});

app.get('/forms/:id/edit', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  const forms = getForms();
  const form = forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).send('Form not found');
  res.render('form', { editing: true, form });
});

app.post('/forms/:id', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  const { name, description } = req.body;
  const forms = getForms();
  const formIndex = forms.findIndex(f => f.id === req.params.id);
  if (formIndex === -1) return res.status(404).send('Form not found');
  forms[formIndex].name = name;
  forms[formIndex].description = description;
  saveForms(forms);
  res.redirect('/');
});

app.get('/forms/:id/submit', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  const forms = getForms();
  const form = forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).send('Form not found');
  res.render('submit', { form });
});

app.post('/forms/:id/entries', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  const { data } = req.body;
  let parsedData;
  try {
    parsedData = JSON.parse(data);
  } catch (e) {
    return res.status(400).send('Invalid JSON data');
  }
  const forms = getForms();
  const form = forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).send('Form not found');
  const newEntry = {
    id: Date.now().toString(),
    data: parsedData,
    submittedAt: new Date().toISOString(),
    status: 'pending'
  };
  form.entries.push(newEntry);
  saveForms(forms);
  res.redirect('/forms/' + req.params.id + '/entries');
});

app.get('/forms/:id/entries', (req, res) => {
  if (!req.session.loggedin) return res.redirect('/login');
  const forms = getForms();
  const form = forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).send('Form not found');
  res.render('entries', { form });
});

app.get('/api/forms/:id/entries', (req, res) => {
  const forms = getForms();
  const form = forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json(form.entries || []);
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});