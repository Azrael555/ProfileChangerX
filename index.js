require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitterStrategy = require('passport-twitter-oauth2').Strategy;
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const OAuth = require('oauth-1.0a');
const crypto = require('crypto');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new TwitterStrategy({
    clientID: process.env.TWITTER_CLIENT_ID,
    clientSecret: process.env.TWITTER_CLIENT_SECRET,
    callbackURL: "https://your-vercel-app.vercel.app/auth/twitter/callback"
}, (accessToken, refreshToken, profile, done) => {
    return done(null, { profile, accessToken, refreshToken });
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

const createOAuthInstance = () => OAuth({
    consumer: { key: process.env.TWITTER_CLIENT_ID, secret: process.env.TWITTER_CLIENT_SECRET },
    signature_method: 'HMAC-SHA1',
    hash_function(base_string, key) {
        return crypto.createHmac('sha1', key).update(base_string).digest('base64');
    }
});

const updateProfileImage = async (accessToken, imagePath) => {
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));

    const response = await axios.post('https://api.twitter.com/1.1/account/update_profile_image.json', formData, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...formData.getHeaders()
        }
    });

    return response.data;
};

const updateProfileBanner = async (accessToken, imagePath) => {
    const formData = new FormData();
    formData.append('banner', fs.createReadStream(imagePath));

    const response = await axios.post('https://api.twitter.com/1.1/account/update_profile_banner.json', formData, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...formData.getHeaders()
        }
    });

    return response.data;
};

app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.send(`
            <h1>Twitter Profile Updater</h1>
            <form action="/update-profile" method="POST">
                <button type="submit">Update Profile</button>
            </form>
            <a href="/logout">Logout</a>
        `);
    } else {
        res.send(`<a href="/auth/twitter">Login with Twitter</a>`);
    }
});

app.get('/auth/twitter', passport.authenticate('twitter'));

app.get('/auth/twitter/callback', 
    passport.authenticate('twitter', { failureRedirect: '/' }),
    (req, res) => res.redirect('/')
);

app.post('/update-profile', async (req, res) => {
    if (!req.isAuthenticated()) return res.redirect('/');

    try {
        const profilePicPath = path.join(__dirname, 'public/images/predefined-profile-pic.jpg');
        const bannerPath = path.join(__dirname, 'public/images/predefined-banner.jpg');

        if (!fs.existsSync(profilePicPath) || !fs.existsSync(bannerPath)) {
            return res.status(400).send('Images not found. Please upload them to public/images directory.');
        }

        await updateProfileImage(req.user.accessToken, profilePicPath);
        await updateProfileBanner(req.user.accessToken, bannerPath);

        res.send('<h1>Profile Updated Successfully!</h1><a href="/">Go Back</a>');
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).send('Failed to update profile.');
    }
});

app.get('/logout', (req, res) => {
    req.logout(() => res.redirect('/'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
