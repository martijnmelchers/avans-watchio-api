
import express from 'express';
import auth from '../auth';
import passport from 'passport';
import Users from '../../documents/user.interface';

const router = express.Router();
router.post('/', auth.optional, (req, res, next) => {
    const user = req.body;

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

    return finalUser.save().then(() => res.json({user: finalUser.toAuthJSON()}))
})



router.post('/login', auth.optional, (req, res, next) => {
    const user = req.body;
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
})

export = router;
