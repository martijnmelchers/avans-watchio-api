import * as express from 'express';
import Users from '../documents/user.interface';
import auth from '../config/auth';
import passport from 'passport';

class UserController {
    public path = '/controllers';
    public router = express.Router();

    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.post(this.path, this.createUser, auth.optional);
        this.router.post(this.path + '/login', this.login, auth.optional);
    }

    createUser = (req: express.Request, res: express.Response) => {
        const { body: { user } } = req;

        if(!user.email) {
            return res.status(422).json({
                errors: {
                    email: 'is required',
                },
            });
        }

        if(!user.password) {
            return res.status(422).json({
                errors: {
                    password: 'is required',
                },
            });
        }

        const finalUser = new Users(user);
        finalUser.setPassword(user.password);

        return finalUser.save().then(() => res.json({user: finalUser.toAuthJSON()}));
    };

    login = (req: express.Request, res: express.Response, next:any) => {
        const { body: { user } } = req;
        if(!user.email) {
            return res.status(422).json({
                errors: {
                    email: 'is required',
                },
            });
        }

        if(!user.password) {
            return res.status(422).json({
                errors: {
                    password: 'is required',
                },
            });
        }


        return passport.authenticate('local', { session: false }, (err, passportUser, info) => {
            if(err) {
                return next(err);
            }
            console.log(err,  passportUser);
            if(passportUser) {
                const user = passportUser;
                user.token = passportUser.generateJWT();

                return res.json({ user: user.toAuthJSON() });
            }

            return res.status(400);
        })(req, res, next);
    }
}

export default UserController;
