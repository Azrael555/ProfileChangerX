require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up session middleware
app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

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

// Routes
app.get('/', (req, res) => {
    res.send('<a href="/auth/twitter">Login with Twitter</a>');
});

app.get('/auth/twitter', passport.authenticate('twitter'));

app.get('/auth/twitter/callback', 
    passport.authenticate('twitter', { failureRedirect: '/' }),
    (req, res) => {
        res.send(`
            <h1>Successfully authenticated with Twitter!</h1>
            <form action="/change-profile" method="POST">
                <button type="submit">Change PFP and Banner</button>
            </form>
        `);
    }
);

app.use(express.urlencoded({ extended: true }));

app.post('/change-profile', async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }

    const { token, tokenSecret } = req.user;

    try {
        // Replace with your image URLs
        const pfpUrl = 'https://i.ibb.co/ZRFrnm0z/zen.png';  // Replace this with your PFP image URL
        const bannerUrl = 'https://i.ibb.co/Xr8GQLzB/magenta-nature-fantasy-landscape-23-2150693731.jpg';  // Replace this with your Banner image URL

        // Fetch images and convert to base64
        const pfpImageResponse = await axios.get(pfpUrl, { responseType: 'arraybuffer' });
        const bannerImageResponse = await axios.get(bannerUrl, { responseType: 'arraybuffer' });

        const pfpBase64 = Buffer.from(pfpImageResponse.data).toString('base64');
        const bannerBase64 = Buffer.from(bannerImageResponse.data).toString('base64');

        // Update Profile Picture
        await axios.post('https://api.twitter.com/1.1/account/update_profile_image.json', {
            image: pfpBase64
        }, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Update Profile Banner
        await axios.post('https://api.twitter.com/1.1/account/update_profile_banner.json', {
            banner: bannerBase64
        }, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        res.send('Profile picture and banner successfully updated!');
    } catch (error) {
        console.error('Error updating profile:', error.response ? error.response.data : error.message);
        res.send('Failed to update profile. Check the console for details.');
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
