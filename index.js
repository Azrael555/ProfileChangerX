require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up storage for profile pictures and banners
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/images/');
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Ensure public directory exists
if (!fs.existsSync('public/images')) {
  fs.mkdirSync('public/images', { recursive: true });
}

// Set up session middleware
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Passport configuration
passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: "https://profile-changer-x.vercel.app/auth/twitter/callback"
}, (token, tokenSecret, profile, done) => {
    return done(null, { profile, token, tokenSecret });
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Create OAuth 1.0a instance
const createOAuthInstance = () => {
  return OAuth({
    consumer: {
      key: process.env.TWITTER_CONSUMER_KEY,
      secret: process.env.TWITTER_CONSUMER_SECRET
    },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
      return crypto
        .createHmac('sha1', key)
        .update(base_string)
        .digest('base64');
    }
  });
};

// Function to update profile picture
const updateProfilePicture = async (token, tokenSecret, imagePath) => {
  try {
    const oauth = createOAuthInstance();
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));

    const requestData = {
      url: 'https://api.twitter.com/1.1/account/update_profile_image.json',
      method: 'POST'
    };

    const headers = oauth.toHeader(oauth.authorize(requestData, {
      key: token,
      secret: tokenSecret
    }));

    // Add form-data headers
    Object.assign(headers, formData.getHeaders());

    const response = await axios.post(requestData.url, formData, {
      headers: headers
    });

    return response.data;
  } catch (error) {
    console.error('Error updating profile picture:', error);
    throw error;
  }
};

// Function to update banner
const updateProfileBanner = async (token, tokenSecret, imagePath) => {
  try {
    const oauth = createOAuthInstance();
    const formData = new FormData();
    formData.append('banner', fs.createReadStream(imagePath));

    const requestData = {
      url: 'https://api.twitter.com/1.1/account/update_profile_banner.json',
      method: 'POST'
    };

    const headers = oauth.toHeader(oauth.authorize(requestData, {
      key: token,
      secret: tokenSecret
    }));

    // Add form-data headers
    Object.assign(headers, formData.getHeaders());

    const response = await axios.post(requestData.url, formData, {
      headers: headers
    });

    return response.data;
  } catch (error) {
    console.error('Error updating profile banner:', error);
    throw error;
  }
};

// Routes
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.send(`
            <h1>Twitter Profile Updater</h1>
            <p>You are logged in as: ${req.user.profile.username}</p>
            <form action="/update-profile" method="POST">
                <button type="submit">Update My Profile Picture and Banner</button>
            </form>
            <a href="/logout">Logout</a>
        `);
    } else {
        res.send(`
            <h1>Twitter Profile Updater</h1>
            <a href="/auth/twitter">Login with Twitter</a>
        `);
    }
});

app.get('/auth/twitter', passport.authenticate('twitter'));

app.get('/auth/twitter/callback', 
    passport.authenticate('twitter', { failureRedirect: '/' }),
    (req, res) => {
        res.redirect('/');
    }
);

app.post('/update-profile', async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect('/');
    }

    try {
        // Paths to your predefined images
        const profilePicPath = path.join(__dirname, 'public/images/predefined-profile-pic.jpg');
        const bannerPath = path.join(__dirname, 'public/images/predefined-banner.jpg');

        // Check if the predefined images exist
        if (!fs.existsSync(profilePicPath) || !fs.existsSync(bannerPath)) {
            return res.status(400).send('Predefined images are not available. Please add them to public/images directory.');
        }

        // Update profile picture and banner
        await updateProfilePicture(req.user.token, req.user.tokenSecret, profilePicPath);
        await updateProfileBanner(req.user.token, req.user.tokenSecret, bannerPath);

        res.send(`
            <h1>Profile Updated Successfully!</h1>
            <p>Your profile picture and banner have been updated.</p>
            <a href="/">Back to Home</a>
        `);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).send(`Error updating profile: ${error.message}`);
    }
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        res.redirect('/');
    });
});

// Admin route to upload new predefined images
app.get('/admin', (req, res) => {
    res.send(`
        <h1>Admin - Upload Predefined Images</h1>
        <form action="/admin/upload" method="POST" enctype="multipart/form-data">
            <div>
                <label for="profile-pic">Profile Picture:</label>
                <input type="file" name="profilePic" id="profile-pic" required />
            </div>
            <div>
                <label for="banner">Banner:</label>
                <input type="file" name="banner" id="banner" required />
            </div>
            <button type="submit">Upload</button>
        </form>
    `);
});

app.post('/admin/upload', upload.fields([
    { name: 'profilePic', maxCount: 1 }, 
    { name: 'banner', maxCount: 1 }
]), (req, res) => {
    try {
        if (!req.files || !req.files.profilePic || !req.files.banner) {
            return res.status(400).send('Please upload both profile picture and banner.');
        }
        
        // Create copies with predefined names
        fs.copyFileSync(
            req.files.profilePic[0].path, 
            path.join(__dirname, 'public/images/predefined-profile-pic.jpg')
        );
        
        fs.copyFileSync(
            req.files.banner[0].path, 
            path.join(__dirname, 'public/images/predefined-banner.jpg')
        );
        
        res.send('Predefined images uploaded successfully!');
    } catch (error) {
        console.error('Error uploading images:', error);
        res.status(500).send(`Error uploading images: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});