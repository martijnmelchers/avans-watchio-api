import * as express from 'express';
import { Request, Response } from 'express';
import Users, { IUser } from '../documents/user.interface';
import auth from '../config/auth';
import passport from 'passport';
import Room from '../documents/room.interface';

class UserController {
	public path = '/users';
	public router = express.Router();

	constructor() {
		this.intializeRoutes();
	}

	public intializeRoutes() {
		this.router.post(this.path, auth.optional, this.createUser);
		this.router.post(`${this.path}/login`, auth.optional, this.login);
		this.router.get(`${this.path}/room`, auth.required, this.getRooms);
	}

	createUser = (req: express.Request, res: express.Response) => {
		const { body: { user } } = req;

		if (!user.email) {
			return res.status(422).json({
				errors: {
					email: 'is required'
				}
			});
		}

		if (!user.password) {
			return res.status(422).json({
				errors: {
					password: 'is required'
				}
			});
		}

		const finalUser = new Users(user);
		finalUser.setPassword(user.password);

		return finalUser.save().then(() => res.json({ user: finalUser.toAuthJSON() }));
	};

	login = (req: express.Request, res: express.Response, next: any) => {
		const { body: { user } } = req;
		if (!user.email) {
			return res.status(422).json({
				errors: {
					email: 'is required'
				}
			});
		}

		if (!user.password) {
			return res.status(422).json({
				errors: {
					password: 'is required'
				}
			});
		}


		return passport.authenticate('local', { session: false }, (err, passportUser, info) => {
			if (err) {
				return next(err);
			}

			if (passportUser) {
				const user = passportUser;
				user.token = passportUser.generateJWT();

				return res.json({ user: user.toAuthJSON() });
			} else {
				return res.status(401).json({ user: null });
			}
		})(req, res, next);
	};

	getRooms = async (req: Request, res: Response) => {
		const user: IUser | undefined = req.user as IUser;

		Users.findOne({ email: user.email }, (err: any, user) => {
			if (user) {
				return Room.find({ Users: { $in: [user.toObject()] } }).then(rooms => {
					return res.json(rooms);
				});
			} else {
				res.status(404);
			}
		});
	};
}

export default UserController;
