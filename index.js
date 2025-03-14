require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({ dest: 'public/images/' });

if (!fs.existsSync('public/images')) {
  fs.mkdirSync('public/images', { recursive: true });
}

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: true
}));

// OAuth 1.0a setup
const oauth = OAuth({
  consumer: { key: process.env.TWITTER_API_KEY, secret: process.env.TWITTER_API_SECRET_KEY },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

// Temporary store for tokens
let requestToken = {};
let userAccessToken = {};

// Routes
app.get('/', (req, res) => {
  if (userAccessToken.oauth_token && userAccessToken.oauth_token_secret) {
    res.send('<h1>Profile Updated Successfully!</h1>');
  } else {
    res.send('<a href="/auth/twitter">Login with Twitter</a>');
  }
});

app.get('/auth/twitter', async (req, res) => {
  const requestData = {
    url: 'https://api.twitter.com/oauth/request_token',
    method: 'POST',
    data: { oauth_callback: 'https://profile-changer-x.vercel.app/auth/twitter/callback' }
  };

  try {
    const authHeader = oauth.toHeader(oauth.authorize(requestData));

    const response = await axios.post(requestData.url, null, {
      headers: { 
        Authorization: authHeader["Authorization"],
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const responseParams = new URLSearchParams(response.data);
    requestToken = {
      oauth_token: responseParams.get('oauth_token'),
      oauth_token_secret: responseParams.get('oauth_token_secret')
    };
    res.redirect(`https://api.twitter.com/oauth/authorize?oauth_token=${requestToken.oauth_token}`);
  } catch (error) {
    console.error('Error getting request token:', error.response.data);
    res.status(500).send('Failed to authenticate with Twitter.');
  }
});

app.get('/auth/twitter/callback', async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;

  if (oauth_token !== requestToken.oauth_token) {
    return res.status(400).send('Invalid token.');
  }

  const requestData = {
    url: 'https://api.twitter.com/oauth/access_token',
    method: 'POST',
    data: { oauth_verifier }
  };

  try {
    const authHeader = oauth.toHeader(oauth.authorize(requestData, requestToken));

    const response = await axios.post(requestData.url, null, {
      headers: {
        Authorization: authHeader["Authorization"],
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const responseParams = new URLSearchParams(response.data);
    userAccessToken = {
      oauth_token: responseParams.get('oauth_token'),
      oauth_token_secret: responseParams.get('oauth_token_secret')
    };

    res.redirect('/update-profile');
  } catch (error) {
    console.error('Error getting access token:', error.response.data);
    res.status(500).send('Failed to authenticate with Twitter.');
  }
});

app.get('/update-profile', async (req, res) => {
  if (!userAccessToken.oauth_token || !userAccessToken.oauth_token_secret) {
    return res.redirect('/');
  }

  try {
    const profilePicPath = path.join(__dirname, 'public/images/predefined-profile-pic.jpg');
    const bannerPath = path.join(__dirname, 'public/images/predefined-banner.jpg');

    if (!fs.existsSync(profilePicPath) || !fs.existsSync(bannerPath)) {
      return res.status(400).send('Predefined images not found. Please upload them in public/images.');
    }

    // Upload Profile Picture
    const profilePicForm = new FormData();
    profilePicForm.append('image', fs.createReadStream(profilePicPath));

    await axios.post('https://api.twitter.com/1.1/account/update_profile_image.json', profilePicForm, {
      headers: {
        Authorization: `Bearer ${userAccessToken.oauth_token}`,
        ...profilePicForm.getHeaders()
      }
    });

    // Upload Banner Image
    const bannerForm = new FormData();
    bannerForm.append('banner', fs.createReadStream(bannerPath));

    await axios.post('https://api.twitter.com/1.1/account/update_profile_banner.json', bannerForm, {
      headers: {
        Authorization: `Bearer ${userAccessToken.oauth_token}`,
        ...bannerForm.getHeaders()
      }
    });

    res.redirect('/');
  } catch (error) {
    console.error('Error updating profile:', error.response.data);
    res.status(500).send('Failed to update profile.');
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
