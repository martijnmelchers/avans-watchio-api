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
        clientID:     "100369552874-hn54n3km6ddufj2mh5pmcr6qtibr14kh.apps.googleusercontent.com",
        clientSecret: "Yhsk6Y-_OBz3TXDIBZZHdjXg",
        callbackURL: "http://localhost:5000/users/google/callback",
    },
    async (accessToken:any, refreshToken:any, profile:any, done: any) =>  {
        console.log("sdasdasd", profile);

        const user = await Users.findOne({googleId: profile.id}).exec();
        console.log('xdsadasdsasdasd');

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
        callbackURL: 'http://localhost:5000/users/facebook/callback',
        clientID: "572379310045978",
        clientSecret: "6d1c4e86d2354ea930ba9b29a9d6eaba",
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
