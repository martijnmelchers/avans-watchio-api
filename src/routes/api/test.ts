import express from 'express';
import auth from '../auth';
import passport from 'passport';
import Users from '../../documents/user.interface';

const router = express.Router();

router.get('/', auth.required, (req, res, next) => {
    res.send("xd");
});

export = router;
