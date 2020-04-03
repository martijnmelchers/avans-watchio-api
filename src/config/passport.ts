import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import Users from '../documents/user.interface';
import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import {Strategy as FacebookStrategy} from 'passport-facebook';


passport.use(new LocalStrategy({
	usernameField: 'user[email]',
	passwordField: 'user[password]'
}, (email, password, done) => {
	Users.findOne({ email })
		.then((user) => {
			if (!user || !user.validatePassword(password)) {
				return done(null, false);
			}
			return done(null, user);
		}).catch(done);
}));

passport.use(new GoogleStrategy({
        clientID:  process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID : "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ? process.env.GOOGLE_CLIENT_SECRET : "",
        callbackURL: process.env.GOOGLE_CALLBACK_URL ? process.env.GOOGLE_CALLBACK_URL : "",
    },
    async (accessToken:any, refreshToken:any, profile:any, done: any) =>  {

        const user = await Users.findOne({googleId: profile.id}).exec();

        if(!user){
            let newUser = {
                email: profile.emails[0].value,
                googleId: profile.id,
            };

            const userMod = new Users(newUser);
            userMod.setPassword(profile.id);

            let savedUser = await userMod.save();
            return done(null, savedUser);
        }
        else{
            if(!user.validatePassword(profile.id))
                return done(null, false);

            return done(null, user);
        }
    }
));

passport.use(new FacebookStrategy({
        clientID:  process.env.FACEBOOK_CLIENT_ID ? process.env.FACEBOOK_CLIENT_ID : "",
        clientSecret: process.env.FACEBOOK_CLIENT_SECRET ? process.env.FACEBOOK_CLIENT_SECRET : "",
        callbackURL: process.env.FACEBOOK_CALLBACK_URL ? process.env.FACEBOOK_CALLBACK_URL : "",
        profileFields: ['email']
    },
    async (accessToken, refreshToken, profile, done) => {
        const user = await Users.findOne({facebookId: profile.id}).exec();
        if(!user){
            let newUser = {
                // @ts-ignore
                email: profile.emails[0].value,
                googleId: profile.id,
            };

            const userMod = new Users(newUser);
            userMod.setPassword(profile.id);

            let savedUser = await userMod.save();
            return done(null, savedUser);
        }
        else{
            if(!user.validatePassword(profile.id))
                return done(null, false);

            return done(null, user);
        }
    }
));
