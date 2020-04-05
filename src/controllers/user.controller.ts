import * as express from 'express';
import { NextFunction, Request, Response } from 'express';
import Users, { IUser } from '../documents/user.interface';
import auth from '../config/auth';
import passport from 'passport';
import Room from '../documents/room.interface';
import fetch from 'node-fetch';

class UserController {
	public path = '/users';
	public router = express.Router();

	constructor() {
		this.initializeRoutes();
	}

	public initializeRoutes() {
		this.router.get(`${this.path}/room`, auth.required, this.getRooms);

		// Local authentication
		// You can only manage yourself, not other users.
		this.router.post(this.path, this.createUser);
		this.router.get(`${this.path}/me`, auth.required, this.getUser);
		this.router.post(`${this.path}/login`, this.login);
		this.router.delete(this.path, auth.required, this.deleteUser);

		this.router.put(`${this.path}`, auth.required, this.updateProfilePicture);

		// Google authentication
		this.router.post(`${this.path}/google/:token`, this.registerGoogle);


		this.router.get(`${this.path}/google`, passport.authenticate("google", {
			scope: ["email", "profile"]
		}));

		this.router.get(`${this.path}/google/callback`, passport.authenticate('google', {
			session: false,
			failureRedirect: '/login'
		}), this.googleCallback);


		// Facebook authentication
		this.router.get(`${this.path}/facebook`, passport.authenticate("facebook", {
			scope: ['email']
		}));

		this.router.get(`${this.path}/facebook/callback`, passport.authenticate('facebook', {
			session: false,
			failureRedirect: '/login'
		}), this.facebookCallback);
	}

	private async getRooms(req: Request, res: Response) {
		const requestUser: IUser = req.user as IUser;
		const user = await Users.findOne({ email: requestUser.email }).exec();

		if (!user)
			return res.sendStatus(401);

		const rooms = await Room.find({ 'Users.User': user._id }).exec();
		return res.json(rooms);
	};

	private async googleCallback(req: Request, res: Response) {
		if (!req.user)
			return res.sendStatus(401);
		let user: any = req.user;
		user.token = user.generateJWT();

		//TODO: REDIRECT BACK TO APP + /token!!!
		return res.json({ user: user.toAuthJSON() });
	};

	private async facebookCallback(req: Request, res: Response) {
		if (!req.user)
			return res.sendStatus(401);


		let user: any = req.user;
		user.token = user.generateJWT();

		return res.json({ user: user.toAuthJSON() });
	};

	private async login(req: Request, res: Response, next: NextFunction) {
		const user: { email: string, password: string } = req.body;

		if (!user.email || !user.password) {
			return res.status(400).json({
				invalid: true
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

	private async createUser(req: Request, res: Response) {
		const user: { firstName: string, lastName: string, email: string, password: string } = req.body;

		if (await Users.findOne({ email: user.email }).exec())
			return res.status(400).json({
				exists: true
			});


		if (!user.email || !user.password || !user.firstName || !user.lastName)
			return res.status(400).json({
				invalid: true
			});


		const newUser = new Users(user);
		newUser.setPassword(user.password);

		return res.json({ user: (await newUser.save()).toAuthJSON() });
	};

	private async deleteUser(req: Request, res: Response) {
		const requestUser: IUser = req.user as IUser;
		const user = await Users.findOneAndDelete({ email: requestUser.email }).exec();

		if (!user)
			return res.sendStatus(401);

		return res.json({ deleted: true });
	}

	private async getUser(req: Request, res: Response) {
		const requestUser: IUser = req.user as IUser;
		const user = await Users.findOne({ email: requestUser.email }).exec();

		if (!user)
			return res.sendStatus(401);

		return res.json(user);
	}

	private async updateProfilePicture(req: Request, res: Response) {
        const user = req.user as IUser;
        const profilePicture = req.body.profilePicture;
        if (!profilePicture)
            return res.sendStatus(400);

        let userObj =  await Users.findOneAndUpdate({email: user.email}, {profilePicture: profilePicture}, {new: true}).exec();
        return res.json(userObj?.toJSON());
    }

	private async registerGoogle(req: Request, res: Response) {
		const response = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${req.params.token}`);

		// TODO: CREATE USER

		return res.json({ valid: true });
	}
}

export default UserController;
