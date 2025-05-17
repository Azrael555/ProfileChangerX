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
    const profilePicPath = path.join(__dirname, 'public/images/pfp.jpg');
    const bannerPath = path.join(__dirname, 'public/images/banner.jpg');

    if (!fs.existsSync(profilePicPath) || !fs.existsSync(bannerPath)) {
      return res.status(400).send('Predefined images are not available.');
    }

    const randomNumber = Math.floor(Math.random() * 10000);
    const newName = `smth #${randomNumber} smth`;
    const newBio = "This is my new bio! 🌟"; // Customize this as needed


    const form = new FormData();
    form.append('image', fs.createReadStream(profilePicPath));

    const request_data = {
      url: 'https://api.twitter.com/1.1/account/update_profile_image.json',
      method: 'POST'
    };
    
    const headers = oauth.toHeader(oauth.authorize(request_data, {
      key: req.session.access_token,
      secret: req.session.access_token_secret
    }));

    Object.assign(headers, form.getHeaders());

    await axios.post(request_data.url, form, { headers });

    // Update Banner Image
    const bannerForm = new FormData();
    bannerForm.append('banner', fs.createReadStream(bannerPath));

    const bannerRequestData = {
      url: 'https://api.twitter.com/1.1/account/update_profile_banner.json',
      method: 'POST'
    };
    
    const bannerHeaders = oauth.toHeader(oauth.authorize(bannerRequestData, {
      key: req.session.access_token,
      secret: req.session.access_token_secret
    }));
    Object.assign(bannerHeaders, bannerForm.getHeaders());

    await axios.post(bannerRequestData.url, bannerForm, { headers: bannerHeaders });
  

  // Update Name and Bio
    const profileUpdateData = {
      url: 'https://api.twitter.com/1.1/account/update_profile.json',
      method: 'POST',
      data: {
        name: newName,
        description: newBio
      }
    };

    const profileUpdateHeaders = oauth.toHeader(oauth.authorize(profileUpdateData, {
      key: req.session.access_token,
      secret: req.session.access_token_secret
    }));

    await axios.post(profileUpdateData.url, new URLSearchParams(profileUpdateData.data), { headers: profileUpdateHeaders });

 
    res.send('<h1>Profile Updated Successfully!</h1>');
  } catch (error) {
    res.status(500).send('Error updating profile.');
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
