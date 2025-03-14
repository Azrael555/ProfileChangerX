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
  consumer: { key: process.env.TWITTER_CONSUMER_KEY, secret: process.env.TWITTER_CONSUMER_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

// Store tokens in session
app.get('/auth/twitter', async (req, res) => {
  const request_data = {
    url: 'https://api.twitter.com/oauth/request_token',
    method: 'POST',
    data: { oauth_callback: 'https://profile-changer-x.vercel.app/auth/twitter/callback' }
  };

  try {
    const headers = oauth.toHeader(oauth.authorize(request_data));
    const response = await axios.post(request_data.url, null, { headers });
    
    const responseParams = new URLSearchParams(response.data);
    req.session.oauth_token = responseParams.get('oauth_token');
    req.session.oauth_token_secret = responseParams.get('oauth_token_secret');
    
    res.redirect(`https://api.twitter.com/oauth/authenticate?oauth_token=${req.session.oauth_token}`);
  } catch (error) {
    res.status(500).send('Error during authentication.');
  }
});

app.get('/auth/twitter/callback', async (req, res) => {
  const request_data = {
    url: 'https://api.twitter.com/oauth/access_token',
    method: 'POST',
    data: {
      oauth_token: req.query.oauth_token,
      oauth_verifier: req.query.oauth_verifier
    }
  };
  
  try {
    const headers = oauth.toHeader(oauth.authorize(request_data));
    const response = await axios.post(request_data.url, null, { headers });
    
    const responseParams = new URLSearchParams(response.data);
    req.session.access_token = responseParams.get('oauth_token');
    req.session.access_token_secret = responseParams.get('oauth_token_secret');
    
    res.redirect('/update-profile');
  } catch (error) {
    res.status(500).send('Error during token exchange.');
  }
});

app.get('/', (req, res) => {
  if (req.session.access_token && req.session.access_token_secret) {
    res.redirect('/update-profile');
    
  } else {
          res.redirect('/auth/twitter')
  }
});

app.get('/update-profile', async (req, res) => {
  if (!req.session.access_token || !req.session.access_token_secret) return res.redirect('/');

  try {
    const profilePicPath = path.join(__dirname, 'public/images/predefined-profile-pic.jpg');
    const bannerPath = path.join(__dirname, 'public/images/predefined-banner.jpg');

    if (!fs.existsSync(profilePicPath) || !fs.existsSync(bannerPath)) {
      return res.status(400).send('Predefined images are not available.');
    }

    // === Step 1: Update Profile Picture ===
    const profileForm = new FormData();
    profileForm.append('image', fs.createReadStream(profilePicPath));

    const profileRequestData = {
      url: 'https://api.twitter.com/1.1/account/update_profile_image.json',
      method: 'POST'
    };
    
    const profileHeaders = oauth.toHeader(oauth.authorize(profileRequestData, {
      key: req.session.access_token,
      secret: req.session.access_token_secret
    }));

    Object.assign(profileHeaders, profileForm.getHeaders());

    await axios.post(profileRequestData.url, profileForm, { headers: profileHeaders });


    // === Step 2: Update Banner Image ===
  try {
    const bannerImage = fs.readFileSync(bannerPath); // Read the file as a buffer

    const bannerRequestData = {
     url: 'https://api.twitter.com/1.1/account/update_profile_banner.json',
     method: 'POST'
    };

    const bannerHeaders = oauth.toHeader(oauth.authorize(bannerRequestData, {
      key: req.session.access_token,
      secret: req.session.access_token_secret
   }));

   // Set content type for raw binary data
   bannerHeaders['Content-Type'] = 'application/octet-stream';

    console.log('Attempting to update banner...');

    // Send the request with raw image data
    const bannerResponse = await axios.post(bannerRequestData.url, bannerImage, { headers: bannerHeaders });

    console.log('Banner update successful:', bannerResponse.data);
  } catch (error) {
    console.error('Error updating banner:', error.response?.data || error.message);
    return res.status(500).send('Error updating banner.');
  }

    // === Success Response ===
    res.send('<h1>Profile and Banner Updated Successfully!</h1>');

  } catch (error) {
    res.status(500).send('Error updating profile or banner.');
  }
});
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

