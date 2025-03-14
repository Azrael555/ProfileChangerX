// api/index.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const axios = require('axios');
const app = express();

// Set up session middleware with more secure configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(express.urlencoded({ extended: true }));

// Passport configuration
passport.use(new TwitterStrategy({
    consumerKey: process.env.TWITTER_CONSUMER_KEY,
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
    callbackURL: process.env.CALLBACK_URL || "https://profile-changer-x.vercel.app/api/auth/twitter/callback"
}, (token, tokenSecret, profile, done) => {
    return done(null, { profile, token, tokenSecret });
}));

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

// Routes
app.get('/', (req, res) => {
    res.send('<a href="/api/auth/twitter">Login with Twitter</a>');
});

app.get('/auth/twitter', passport.authenticate('twitter'));

app.get('/auth/twitter/callback', 
    passport.authenticate('twitter', { failureRedirect: '/' }),
    (req, res) => {
        res.send(`
            <h1>Successfully authenticated with Twitter!</h1>
            <form action="/api/change-profile" method="POST">
                <button type="submit">Change PFP and Banner</button>
            </form>
        `);
    }
);

app.post('/change-profile', async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }
    
    const { token, tokenSecret } = req.user;
    
    try {
        // Replace with your image URLs
        const pfpUrl = 'https://i.ibb.co/ZRFrnm0/zen.png';  // Fix URL typo
        const bannerUrl = 'https://i.ibb.co/Xr8GQLB/magenta-nature-fantasy-landscape-23-2150693731.jpg'; // Fix URL typo
        
        // Fetch images and convert to base64
        const pfpImageResponse = await axios.get(pfpUrl, { responseType: 'arraybuffer' });
        const bannerImageResponse = await axios.get(bannerUrl, { responseType: 'arraybuffer' });
        
        const pfpBase64 = Buffer.from(pfpImageResponse.data).toString('base64');
        const bannerBase64 = Buffer.from(bannerImageResponse.data).toString('base64');
        
        // Update Profile Picture using OAuth 1.0a format (not Bearer token)
        const OAuth = require('oauth').OAuth;
        const oauth = new OAuth(
            'https://api.twitter.com/oauth/request_token',
            'https://api.twitter.com/oauth/access_token',
            process.env.TWITTER_CONSUMER_KEY,
            process.env.TWITTER_CONSUMER_SECRET,
            '1.0A',
            null,
            'HMAC-SHA1'
        );
        
        // Use proper OAuth methods for Twitter API v1.1
        oauth.post(
            'https://api.twitter.com/1.1/account/update_profile_image.json',
            token,
            tokenSecret,
            { image: pfpBase64 },
            'application/json',
            function(error, data) {
                if (error) {
                    console.error('Error updating profile image:', error);
                }
            }
        );
        
        oauth.post(
            'https://api.twitter.com/1.1/account/update_profile_banner.json',
            token,
            tokenSecret,
            { banner: bannerBase64 },
            'application/json',
            function(error, data) {
                if (error) {
                    console.error('Error updating banner:', error);
                }
            }
        );
        
        res.send('Profile picture and banner successfully updated!');
    } catch (error) {
        console.error('Error updating profile:', error.response ? error.response.data : error.message);
        res.status(500).send('Failed to update profile. Check the console for details.');
    }
});

// Export for serverless use
module.exports = app;