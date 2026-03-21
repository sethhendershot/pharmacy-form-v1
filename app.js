const express = require('express');
const session = require('express-session');
require('dotenv').config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-key', // Consider moving to .env
  resave: false,
  saveUninitialized: true
}));

app.set('view engine', 'ejs');

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

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});