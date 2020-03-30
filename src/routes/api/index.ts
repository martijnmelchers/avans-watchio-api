import express from 'express';

const router = express.Router();
router.use('/users', require('./user'));
router.use('/test',  require('./test'));



router.get('/', )
export = router;
