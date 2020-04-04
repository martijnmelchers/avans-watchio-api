import { default as express, Request, Response } from 'express';
import Rooms, { IRoom } from '../documents/room.interface';
import auth from '../config/auth';
import Users, { IUser } from '../documents/user.interface';
import Roles, { IRole } from '../documents/role.interface';
import { IQueueItem } from '../documents/queue.interface';
import { Server } from 'socket.io';
import App from '../app';

class RoomController {
	public path = '/rooms';
	public router = express.Router();
	private _app: App | undefined;
	private _io: Server;

	constructor(io: Server) {
		this._io = io;
		this.intializeRoutes();
	}


	public intializeRoutes() {
		this.router.get(this.path, auth.required, this.getRooms);
		this.router.get(`${this.path}/page/:page`, auth.required, this.getRoomsPaging);
		this.router.post(`${this.path}/:roomId`, auth.required, (req, res) => this.joinRoom(req, res));
		this.router.delete(`${this.path}/:roomId/leave`, auth.required, (req, res) => this.leaveRoom(req, res));
		this.router.get(`${this.path}/:roomId`, auth.required, this.getRoom);
		this.router.post(`${this.path}`, auth.required, this.createRoom);
		this.router.delete(`${this.path}/:roomId`, auth.required, (req, res) => this.deleteRoom(req, res));

		// User routes
		this.router.delete(`${this.path}/:roomId/users/:email`, auth.required, (req, res) => this.kickUser(req, res));
		this.router.get(`${this.path}/:roomId/users/:email`, auth.required, (req, res) => this.getUser(req, res));

		this.router.post(`${this.path}/roomId/users`, auth.required, (req, res) => this.inviteUser(req, res));

		// Queue Routes
		this.router.post(`${this.path}/:roomId/queue`, auth.required, (req, res) => this.addToQueue(req, res));
		this.router.delete(`${this.path}/:roomId/queue/:queueItemPos`, auth.required, (req, res) => this.removeFromQueue(req, res));
	}

	private async getRooms(req: Request, res: Response) {
		res.json(await Rooms.find());
	};

	private async getRoomsPaging(req: Request, res: Response) {
		res.json(await Rooms.find().skip((Number(req.params.page) - 1) * 20).limit(20));
	};

	private async getRoom(req: Request, res: Response) {
		if (!req.params.roomId) res.sendStatus(422);
		const user: IUser | undefined = req.user as IUser;
		const userObj = await Users.findOne({ email: user.email }).exec();

		try {
			const room = await Rooms.findOne({ Id: req.params.roomId })
				.populate({ path: 'Users.User', model: 'User' })
				.populate({ path: 'Users.Role', model: 'Role' })
				.exec();
			if (!room)
				return res.sendStatus(404);


			// @ts-ignore
			if (!room.Users.find((user) => user.User.email == userObj?.email)) {
				return res.sendStatus(401);
			}

			res.json(room.toJSON());
		} catch (e) {
			console.log("An error occurred while getting the room!");
		}

		res.status(404);
	};

	private async createRoom(req: Request, res: Response) {
		let room = req.body;
		const user: IUser | undefined = req.user as IUser;
		const userObj = await Users.findOne({ email: user.email }).exec();
		const password = room.password;
		room = room as IRoom;

		const roomModel = new Rooms(room);
		if (password) {
			roomModel.setPassword(password);
		}

		roomModel.Owner = userObj?.toObject();
		// @ts-ignore
		roomModel.Users = [{ User: userObj?._id }];
		const roomObj: IRoom = await (await Rooms.create(roomModel)).populate({
			path: 'Users.User',
			model: 'User'
		}).execPopulate();

		res.json(roomObj.toJSON());
	};

	private async joinRoom(req: Request, res: Response) {
		const roomId: string = req.params.roomId;
		const password = req.body.password;

		const user: IUser | undefined = req.user as IUser;

		const userObj = await Users.findOne({ email: user.email }).exec();
		const room = await Rooms.findOne({ Id: roomId }).exec();

		if (!user)
			return res.sendStatus(400);

		if (!room)
			return res.sendStatus(404);


		let authorized: boolean = true;
		if (room.Password) {
			authorized = room.validatePassword(password);
		}

		if (!authorized)
			return res.sendStatus(401);

		const defaultRole = await this.getRole("Viewer");
		const roomObj = await Rooms.findByIdAndUpdate(room._id, {
			$addToSet: {
				Users: [{
					Role: defaultRole._id,
					User: userObj?._id
				}]
			}
		}, { new: true })
			.populate({ path: 'Users.User', model: 'User' })
			.populate({ path: 'User.Role', model: 'Role' })
			.exec();
		if (!roomObj)
			return res.sendStatus(500);

		this._io.in(roomObj.Id).emit('room:updated', roomObj.toJSON());
		this._io.in(roomObj.Id).emit('room:user:joined', userObj?.toJSON());
		return res.json(roomObj.toJSON());
	};


	private async leaveRoom(req: Request, res: Response) {
		const roomId: string = req.params.roomId;
		const user: IUser | undefined = req.user as IUser;
		const userObj = await Users.findOne({ email: user.email }).exec();
		const room = await Rooms.findOne({ Id: roomId }).exec();

		if (room?.Owner.toString() == userObj?._id.toString()) {
			res.statusCode = 400;
			return res.json({ message: "Room owner cannot leave room" });
		}
		const roomObj = await Rooms.findOneAndUpdate({ Id: roomId }, { $pull: { Users: { User: userObj?.toObject() } } }, { new: true })
			.populate({ path: 'Users.User', model: 'User' })
			.populate({ path: 'User.Role', model: 'Role' })
			.exec();
		if (!roomObj)
			return res.sendStatus(500);


		this._io.in(roomObj.Id).emit('room:updated', roomObj.toJSON());
		this._io.in(roomObj.Id).emit('room:user:leaved', userObj?.toJSON());

		return res.json(roomObj.toJSON());
	};

	private async deleteRoom(req: Request, res: Response) {
		if (!req.params.roomId) res.sendStatus(422);
		const roomId = req.params.roomId;

		const user: IUser | undefined = req.user as IUser;
		const userObj = await Users.findOne({ email: user.email }).exec();


		const room = await Rooms.findOne({ Id: roomId }).exec();
		if (!room)
			return res.sendStatus(404);

		if (room.Owner.toString() != userObj?._id.toString())
			return res.sendStatus(401);

		Rooms.deleteOne({ Id: roomId }).then(() => {
			// Room has been deleted send event so connected users can deal with this.
			this._io?.in(roomId).emit('room:deleted');

			return res.sendStatus(200);
		});
	};


	private async addToQueue(req: Request, res: Response) {
		if (!req.params.roomId) res.sendStatus(400);
		const user: IUser | undefined = req.user as IUser;


		if (!this.isInRoom(user, req.params.roomId))
			return res.sendStatus(401);

		let room: IRoom | null | undefined = await Rooms.findOne({ Id: req.params.roomId }).exec();
		if (!room)
			return res.sendStatus(404);

		const index: number = this.getQueueIndex(room);

		const queueItem = req.body;
		queueItem.Position = index + 1;

		room.Queue.push(queueItem);
		room = await room.save();
		if (!room)
			return res.sendStatus(500);

		room = await room.populate({ path: 'Users.User', model: 'User' })
			.populate({ path: 'User.Role', model: 'Role' })
			.execPopulate();

		this._io.in(room.Id).emit('room:updated', room.toObject());
		this._io.in(room.Id).emit('room:queue:added', room.toObject());
		return res.json(room.toJSON());
	};


	private async removeFromQueue(req: Request, res: Response) {
		if (!req.params.roomId || !req.params.queueItemPos) res.sendStatus(400);
		const user: IUser | undefined = req.user as IUser;

		let room = await Rooms.findOne({ Id: req.params.roomId }).exec();
		if (!room)
			return res.sendStatus(404);

		if (!this.isInRoom(user, req.params.roomId))
			return res.sendStatus(401);

		const posNum = Number(req.params.queueItemPos);

		// @ts-ignore
		Rooms.findOneAndUpdate({ Id: room.Id }, { $pull: { Queue: { Position: posNum } } }, { new: true })
			.populate({ path: 'Users.User', model: 'User' })
			// @ts-ignore
			.populate({ path: 'User.Role', model: 'Role' }, (err, updated) => {
				if (!updated)
					return res.sendStatus(500);


				this._io.in(updated.Id).emit('room:updated', updated);
				this._io.in(updated.Id).emit('room:queue:removed', updated);
				return res.json(updated.toJSON());
			});
	};


	private async getUser(req: Request, res: Response) {
		if (!req.params.roomId || !req.params.email) res.sendStatus(400);

		const user = await Users.findOne({ email: req.params.email }).exec();
		return res.json(user?.toJSON());
	};

	private async inviteUser(req: Request, res: Response) {
		const roomId: string = req.params.roomId;
		const room = await Rooms.findOne({ Id: roomId }).exec();
		const addedUserId = req.body.Id;
		if (!room)
			return res.sendStatus(404);

		const user: IUser | undefined = req.user as IUser;
		const userObj = await Users.findOne({ email: user.email }).exec();

		if (!userObj || !addedUserId)
			return res.sendStatus(400);



		const viewerRole = await this.getRole('Viewer');
		if (user._id.toString() == room?.Owner.toString()) {
			const roomObj = await Rooms.findByIdAndUpdate(room._id, {
				$addToSet: {
					Users: [{
						Role: viewerRole._id,
						User: addedUserId
					}]
				}
			}, { new: true })
				.populate({ path: 'Users.User', model: 'User' })
				.populate({ path: 'Users.Role', model: 'Role' })
				.exec();

			if (!roomObj)
				return;

			this._io.in(roomObj.Id).emit('room:user:joined', userObj.toJSON());
			this._io.in(roomObj.Id).emit('room:updated', roomObj.toJSON());
			return res.json(roomObj?.toJSON());
		}

		return res.sendStatus(401);
	};


	private async kickUser(req: Request, res: Response) {
		const user = req.user as IUser;
		const email = req.params.email;
		let room = await Rooms.findOne({ Id: req.params.roomId }).populate({
			path: 'Users.User',
			model: 'User'
		}).exec();

		if (!room)
			return res.sendStatus(404);

		const kickedUser = await Users.findOne({ email: email }).exec();
		console.log(kickedUser);
		if (!kickedUser)
			return res.sendStatus(404);


		if (user.id == room.Owner.toString()) {
		    await room.update({$pull: {Users: {User: kickedUser._id}}}).exec();


			if (!room)
				return res.sendStatus(404);

			this._io.in(room.Id).emit('room:updated', room.toJSON());
			this._io.in(room.Id).emit('room:user:kicked', kickedUser.toJSON());
			return res.json(room?.toJSON());
		}

		return res.sendStatus(401);
	};


	private getRole(roleName: string): Promise<IRole> {
		return new Promise<IRole>((resolve, reject) => {
			Roles.findOne({ Name: roleName }, (err: any, room: any) => {
				if (err) reject(err);
				resolve(room);
			});
		});
	}

	private isInRoom = async (user: IUser, roomId: string): Promise<boolean> => {
		return new Promise<boolean>(async (resolve, reject) => {
			const userObj = await Users.findOne({ email: user.email }).exec();
			if (!userObj)
				return resolve(false);

			const room = await Rooms.findOne({ Id: roomId, Users: { $in: userObj?.toObject() } }).exec();
			return resolve(room != undefined);
		});
	};

	private getQueueIndex(room: IRoom): number {
		let index: number = 0;
		// @ts-ignore
		room.Queue.forEach((queueItem: IQueueItem) => {
			if (queueItem.Position >= index)
				index = queueItem.Position;
		});

		return index;
	}
}

export default RoomController;
