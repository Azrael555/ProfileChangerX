require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up multer for uploading images
const upload = multer({ dest: 'public/images/' });

// Ensure public/images directory exists
if (!fs.existsSync('public/images')) {
  fs.mkdirSync('public/images', { recursive: true });
}

// Express middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Express session
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport Strategy
passport.use(new OAuth2Strategy({
  authorizationURL: 'https://twitter.com/i/oauth2/authorize',
  tokenURL: 'https://api.twitter.com/2/oauth2/token',
  clientID: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_CLIENT_SECRET,
  callbackURL: "https://profile-changer-x.vercel.app/auth/twitter/callback",
  scope: ['tweet.read', 'users.read', 'tweet.write', 'offline.access']
},
(accessToken, refreshToken, profile, done) => {
  done(null, { accessToken, refreshToken });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Routes
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    res.send(`
      <h1>Profile Updater</h1>
      <form action="/update-profile" method="POST">
        <button type="submit">Update Profile</button>
      </form>
      <a href="/logout">Logout</a>
    `);
  } else {
    res.send('<a href="/auth/twitter">Login with Twitter</a>');
  }
});

app.get('/auth/twitter', passport.authenticate('oauth2'));

app.get('/auth/twitter/callback', 
  passport.authenticate('oauth2', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.post('/update-profile', async (req, res) => {
  if (!req.isAuthenticated()) return res.redirect('/');

  try {
    const profilePicPath = path.join(__dirname, 'public/images/predefined-profile-pic.jpg');
    const bannerPath = path.join(__dirname, 'public/images/predefined-banner.jpg');

    if (!fs.existsSync(profilePicPath) || !fs.existsSync(bannerPath)) {
      return res.status(400).send('Predefined images not found. Please upload them in public/images.');
    }

    const form = new FormData();
    form.append('image', fs.createReadStream(profilePicPath));

    const response = await axios.post('https://api.twitter.com/2/users/me/profile_image', form, {
      headers: {
        Authorization: `Bearer ${req.user.accessToken}`,
        ...form.getHeaders()
      }
    });

    res.send('<h1>Profile Updated Successfully!</h1>');
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).send('Failed to update profile.');
  }
});

app.get('/logout', (req, res) => {
  req.logout();
  res.redirect('/');
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
