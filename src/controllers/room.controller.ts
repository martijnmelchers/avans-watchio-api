import { default as express, Request, Response } from 'express';
import Rooms, { IRoom } from '../documents/room.interface';
import auth from '../config/auth';
import Users, { IUser } from '../documents/user.interface';
import Roles from '../documents/role.interface';
import { IQueueItem } from '../documents/queue.interface';
import SocketIO, { Server, Socket } from 'socket.io';
import App from '../app';
import { inRoom } from '../middleware/in-room.middleware';
import StreamController from './stream.controller';
import * as jwt from 'jsonwebtoken';
import parseTorrent from 'parse-torrent';

class RoomController {
	public path = '/rooms';
	public router = express.Router();
	private _app: App | undefined;
	private _io: Server;
	private _streamController: StreamController;
	private socketInfo: { socketId: string, userId: string, roomId: string, ready: boolean }[] = [];

	constructor(io: Server, streamController: StreamController) {
		this._io = io;
		this._streamController = streamController;
		this.intializeRoutes();
		this.initializeSocket();
	}

	public intializeRoutes() {
		this.router.get(this.path, auth.required, this.getRooms);
		this.router.get(`${this.path}/page/:page`, auth.required, this.getRoomsPaging);
		this.router.post(`${this.path}/:roomId`, auth.required, (req, res) => this.joinRoom(req, res));
		this.router.delete(`${this.path}/:roomId/leave`, auth.required, inRoom, (req, res) => this.leaveRoom(req, res));
		this.router.get(`${this.path}/:roomId`, auth.required, inRoom, this.getRoom);
		this.router.post(`${this.path}`, auth.required, this.createRoom);
		this.router.delete(`${this.path}/:roomId`, auth.required, inRoom, (req: any, res: any) => this.deleteRoom(req, res));

		// User routes
		this.router.delete(`${this.path}/:roomId/users/:email`, auth.required, inRoom, (req, res) => this.kickUser(req, res));
		this.router.get(`${this.path}/:roomId/users/:email`, auth.required, inRoom, (req, res) => this.getUser(req, res));

		this.router.post(`${this.path}/roomId/users`, auth.required, inRoom, (req, res) => this.inviteUser(req, res));

		// Queue Routes
		this.router.post(`${this.path}/:roomId/queue`, auth.required, inRoom, (req, res) => this.addToQueue(req, res));
		this.router.delete(`${this.path}/:roomId/queue/:queueItemPos`, auth.required, inRoom, (req, res) => this.removeFromQueue(req, res));
	}

	// Checks if the user is part of this room and connects to it.
	async connectRoom(socket: Socket, data: { user: string, room: string }) {
		if (!this.authenticateSocket(data.user, data.room)) {
			// socket.emit('error', {message: 'You are not in this room'});
		}

		const user = await this.authenticate(data.user);
		const room = await Rooms.findOne({ Id: data.room }).populate({ path: 'Users.User', model: 'User' });
		if (!room) {
			socket.emit('room:error', { message: "Invalid room provided." });
			return;
		}

		// Leave all rooms the socket is currently in.
		socket.leaveAll();

		console.log(`${user.email} connected to room ${room.Id}`);

		// Set the id of the socket to the id of the user.
		this.socketInfo.push({
			socketId: socket.id,
			userId: user._id,
			roomId: room.Id,
			ready: false
		});

		this.startTorrents(room.Id);

		// Connect to the room.
		socket.join(room.Id);
		// Send the connected event and roomData to the client.
		socket.emit('room:connected', room.toObject());
		socket.emit('room:user:online', this.getOnlineUsers(room.Id));
		this._streamController.sendProgress(await this.getTorrents(room.Id), room.Id);
		this._io.in(room.Id).emit('room:user:online', this.getOnlineUsers(room.Id));
		this._io.in(room.Id).emit('room:user:ready', this.getReadyUsers(room.Id));
	}

	private initializeSocket() {
		this._io.on('connection', (socket: Socket) => this.onConnect(socket));
	}

	private async getRooms(req: Request, res: Response) {
		const user = req.user as IUser;
		res.json(await Rooms.find({ 'Users.User': { $ne: user.id } }));
	};

	private async getRoomsPaging(req: Request, res: Response) {
		const user = req.user as IUser;
		res.json(await Rooms.find({ 'Users.User': { $ne: user.id } }).skip((Number(req.params.page) - 1) * 20).limit(20));
	};

	private async getRoom(req: Request, res: Response) {
		try {
			const room = await Rooms.findOne({ Id: req.params.roomId })
				.populate({ path: 'Users.User', model: 'User' })
				.populate({ path: 'Users.Role', model: 'Role' })
				.exec();

			return res.json(room?.toJSON());
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

		if (!defaultRole)
			return;

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
		if (room?.Owner.toString() != userObj?._id.toString())
			return res.sendStatus(401);

		Rooms.deleteOne({ Id: roomId }).then(() => {
			// Room has been deleted send event so connected users can deal with this.
			this._io?.in(roomId).emit('room:deleted');

			return res.sendStatus(200);
		});
	};

	private async addToQueue(req: Request, res: Response) {
		if (!req.params.roomId) res.sendStatus(400);

		let room: IRoom | null | undefined = await Rooms.findOne({ Id: req.params.roomId }).exec();
		// @ts-ignore
		const index: number = this.getQueueIndex(room);


		let infoHash = parseTorrent(req.body.MagnetUri).infoHash;
		if (!infoHash)
			return res.sendStatus(400);

		const queueItem = req.body;
		queueItem.Position = index + 1;
		queueItem.InfoHash = infoHash;

		room?.Queue.push(queueItem);
		room = await room?.save();
		if (!room)
			return res.sendStatus(500);

		room = await room.populate({ path: 'Users.User', model: 'User' })
			.populate({ path: 'User.Role', model: 'Role' })
			.execPopulate();


		this.startTorrents(room.Id);
		this._io.in(room.Id).emit('room:updated', room.toObject());
		this._io.in(room.Id).emit('room:queue:added', room.toObject());
		res.json(room.toJSON());
	};

	private async removeFromQueue(req: Request, res: Response) {
		if (!req.params.roomId || !req.params.queueItemPos) res.sendStatus(400);
		const user: IUser | undefined = req.user as IUser;
		const posNum = Number(req.params.queueItemPos);

		// @ts-ignore
		Rooms.findOneAndUpdate({ Id: req.params.roomId }, { $pull: { Queue: { Position: posNum } } }, { new: true })
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

		if (!viewerRole)
			return;

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
		if (!kickedUser)
			return res.sendStatus(404);


		if (user.id == room.Owner.toString()) {
			const updatedRoom = await Rooms
				.findOneAndUpdate({ Id: req.params.roomId }, { $pull: { Users: { User: kickedUser._id } } }, { new: true })
				.populate({ path: 'Users.User', model: 'User' })
				.populate({ path: 'Users.Role', model: 'Role' })
				.exec();

			if (!updatedRoom)
				return res.sendStatus(404);

			this._io.in(room.Id).emit('room:updated', updatedRoom.toJSON());
			this._io.in(room.Id).emit('room:user:kicked', kickedUser.toJSON());
			return res.json(room?.toJSON());
		}

		return res.sendStatus(401);
	};

	private async getRole(roleName: string) {
		return await Roles.findOne({ Name: roleName }).exec();
	}

	private getQueueIndex(room: IRoom): number {
		let index: number = 0;
		// @ts-ignore
		room.Queue.forEach((queueItem: IQueueItem) => {
			if (queueItem.Position >= index)
				index = queueItem.Position;
		});

		return index;
	}

	private async getTorrents(roomId: string): Promise<string[]> {
		const room = await Rooms.findOne({ Id: roomId }).exec();
		if (!room)
			return [];

		return room.Queue.map((queueItem: IQueueItem) => queueItem.MagnetUri);
	}

	private async stopTorrents(roomId: string): Promise<string[]> {
		const room = await Rooms.findOne({ Id: roomId }).exec();
		if (!room)
			return [];
		let torrentHashes = [];
		for (const queueItem of room.Queue) {
			torrentHashes.push(await this._streamController.stopStream(queueItem.MagnetUri, roomId));
		}
		return torrentHashes;
	}


	/*
		Start socket routes
	 */

	private async startTorrents(roomId: string): Promise<string[]> {
		const room = await Rooms.findOne({ Id: roomId }).exec();
		if (!room)
			return [];

		let torrentHashes: string[] = [];
		for (const queueItem of room.Queue) {
			let torrentHash = this._streamController.setupStream(queueItem.MagnetUri, roomId);
			if (torrentHash)
				torrentHashes.push();
		}
		return torrentHashes;
	}

	private onConnect(socket: Socket) {
		// Current room is also stored locally.
		socket.on('room:connect', (data) => this.connectRoom(socket, data));
		socket.on('room:user:ready', (ready) => this.updateReady(socket, ready));
		socket.on('room:user:play', (data) => this.sendPlayEvent(socket, data));
		socket.on('room:user:pause', () => this.sendPauseEvent(socket));
		socket.on('disconnect', () => this.disconnectRoom(socket));
	}

	private authenticateSocket(token: string, roomId: string): Promise<boolean> {
		return new Promise<boolean>(async (resolve) => {
			jwt.verify(token, 'secret', (err, decoded: any) => {
				if (err) throw err;

				Users.findOne({ email: decoded.email }, async (err, user: IUser) => {
					const room: IRoom | null = await Rooms.findOne({ Id: roomId }).populate({
						path: 'Users',
						model: 'User'
					});

					if (!room)
						return resolve(false);

					const inRoom = (room.Users.find((us) => us.toString() == user.toString()) != undefined);

					return resolve(inRoom);
				});

				return resolve(false);
			});
		});
	}

	private authenticate(token: string): Promise<IUser> {
		return new Promise<IUser>((resolve, reject) => {
			jwt.verify(token, 'secret', (err, decoded: any) => {
				if (err) throw err;
				Users.findOne({ email: decoded.email }, (err, res: IUser) => {
					resolve(res);
				});
			});
		});
	}

	private getOnlineUsers(roomId: string): string[] {
		const connectedUsers: string[] = [];
		const connectedSockets = this.socketInfo.filter(x => x.roomId == roomId);

		for (const socket of connectedSockets)
			connectedUsers.push(socket.userId);

		return connectedUsers;
	}

	private getReadyUsers(roomId: string) {
		const readyUsers: string[] = [];
		const connectedSockets = this.socketInfo.filter(x => x.roomId == roomId && x.ready);

		for (const socket of connectedSockets)
			readyUsers.push(socket.userId);

		return readyUsers;
	}

	private disconnectRoom(socket: SocketIO.Socket) {
		const socketInfo = this.findSocket(socket);

		if (!socketInfo)
			return;

		console.log(`User disconnected from room ${socketInfo.roomId}`);
		this.socketInfo.splice(this.socketInfo.indexOf(socketInfo), 1);

		// Only stop when all users leaved
		if (this.getOnlineUsers(socketInfo.roomId).length === 0) {
			this.stopTorrents(socketInfo.roomId);
		}

		// Send ready and online events so the clients can be updated.
		this._io.in(socketInfo.roomId).emit('room:user:online', this.getOnlineUsers(socketInfo.roomId));
		this._io.in(socketInfo.roomId).emit('room:user:ready', this.getReadyUsers(socketInfo.roomId));
	}

	private updateReady(socket: SocketIO.Socket, ready: boolean) {
		const socketInfo = this.findSocket(socket);

		if (!socketInfo)
			return;
		socketInfo.ready = ready;
		this._io.in(socketInfo.roomId).emit('room:user:ready', this.getReadyUsers(socketInfo.roomId));
	}

	private sendPlayEvent(socket: Socket, currentTime: number) {
		const socketInfo = this.findSocket(socket);

		if (!socketInfo)
			return;

		socket.broadcast.to(socketInfo.roomId).emit('room:player:play', {
			user: socketInfo.userId,
			time: currentTime,
			eventTime: new Date()
		});
	}

	private sendPauseEvent(socket: Socket) {
		const socketInfo = this.findSocket(socket);

		if (!socketInfo)
			return;

		socket.broadcast.to(socketInfo.roomId).emit('room:player:pause', { user: socketInfo.userId });
	}

	private findSocket(socket: Socket) {
		return this.socketInfo.find(x => x.socketId == socket.id);
	}
}

export default RoomController;

