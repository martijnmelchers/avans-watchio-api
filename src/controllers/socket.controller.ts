import SocketIO, { Server, Socket } from 'socket.io';
import Rooms, { IRoom } from '../documents/room.interface';
import * as jwt from 'jsonwebtoken';
import Users, { IUser } from '../documents/user.interface';
import StreamController from './stream.controller';
import { IQueueItem } from '../documents/queue.interface';

export default class SocketController {
	private readonly _io: Server;
	private readonly _streamController: StreamController;
	private socketInfo: { socketId: string, userId: string, roomId: string }[] = [];
	private torrentInfo: { hash: string, ready: boolean }[] = [];

	constructor(io: Server, streamController: StreamController) {
		this._io = io;
		this._streamController = streamController;
		this.initializeSocket();
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
			roomId: room.Id
		});

		if (this.getOnlineUsers(room.Id).length == 1)
			this.startTorrents(room.Id);

		// Connect to the room.
		socket.join(room.Id);
		// Send the connected event and roomData to the client.
		socket.emit('room:connected', room.toObject());
		socket.emit('room:user:online', this.getOnlineUsers(room.Id));
		this._streamController.sendProgress(await this.getTorrents(room.Id), room.Id);
		this._io.in(room.Id).emit('room:user:online', this.getOnlineUsers(room.Id));
	}

	public async startTorrents(roomId: string): Promise<void> {
		const room = await Rooms.findOne({ Id: roomId }).exec();

		if (!room)
			return;

		for (const queueItem of room.Queue) {
			const existing = this.torrentInfo.find(x => x.hash == queueItem.InfoHash);


			if (existing)
				this.torrentInfo.splice(this.torrentInfo.indexOf(existing), 1);

			this._streamController.setupStream(queueItem.MagnetUri, roomId);
			this.torrentInfo.push({
				hash: queueItem.InfoHash,
				ready: false
			});

			this._streamController.once(`torrent:${queueItem.InfoHash}:ready`, () => {
				const existing = this.torrentInfo.find(x => x.hash == queueItem.InfoHash);

				// If we can't find it, it has most likely been removed, no problem! :-)
				if (!existing)
					return;

				existing.ready = true;
				this._io.in(roomId).emit(`room:torrent:${existing.hash}:ready`, { hash: existing.hash });
				this._io.in(roomId).emit(`room:torrent:ready`, existing.hash);
			});

		}
	}

	private initializeSocket() {
		this._io.on('connection', (socket: Socket) => this.onConnect(socket));
	}

	private onConnect(socket: Socket) {
		// Current room is also stored locally.
		socket.on('room:connect', (data) => this.connectRoom(socket, data));
		socket.on('room:user:play', (data) => this.sendPlayEvent(socket, data));
		socket.on('room:user:pause', () => this.sendPauseEvent(socket));
		// Sync events
		socket.on('room:torrent:canStream', (hash) => this.isStreamable(socket, hash));
		socket.on('room:player:askSync', () => this.askSync(socket));
		socket.on('room:player:replySync', (data) => this.sendSync(socket, data));
		socket.on('room:player:forceSync', (data) => this.forceSync(socket, data));

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

	private disconnectRoom(socket: SocketIO.Socket) {
		const socketInfo = this.findSocket(socket);

		if (!socketInfo)
			return;

		console.log(`User disconnected from room ${socketInfo.roomId}`);
		this.socketInfo.splice(this.socketInfo.indexOf(socketInfo), 1);

		// Only stop when all users left
		if (this.getOnlineUsers(socketInfo.roomId).length === 0) {
			this.stopTorrents(socketInfo.roomId);
		}

		// Send online events so the clients can be updated.
		this._io.in(socketInfo.roomId).emit('room:user:online', this.getOnlineUsers(socketInfo.roomId));
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

	private async stopTorrents(roomId: string): Promise<void> {
		const room = await Rooms.findOne({ Id: roomId }).exec();

		if (!room)
			return;

		for (const queueItem of room.Queue) {
			const existing = this.torrentInfo.find(x => x.hash == queueItem.InfoHash);

			if (!existing)
				return;

			this.torrentInfo.splice(this.torrentInfo.indexOf(existing), 1);
			await this._streamController.stopStream(queueItem.MagnetUri);
		}

		return;
	}

	private async getTorrents(roomId: string): Promise<string[]> {
		const room = await Rooms.findOne({ Id: roomId }).exec();
		if (!room)
			return [];

		return room.Queue.map((queueItem: IQueueItem) => queueItem.MagnetUri);
	}

	private isStreamable(socket: Socket, hash: string) {
		const socketInfo = this.findSocket(socket);
		const torrentInfo = this.torrentInfo.find(x => x.hash === hash);

		if (!socketInfo || !torrentInfo)
			return;


		this._io.in(socketInfo.roomId).emit(`room:torrent:${torrentInfo.hash}:streamable`, torrentInfo.ready);
	}

	private askSync(socket: Socket) {
		const socketInfo = this.findSocket(socket);

		if (!socketInfo)
			return;

		this._io.in(socketInfo.roomId).emit('room:player:askSync', socketInfo.userId);
	}

	private sendSync(socket: Socket, data: any) {
		const socketInfo = this.findSocket(socket);

		if (!socketInfo)
			return;

		this._io.in(socketInfo.roomId).emit('room:player:answerSync', data);

	}

	private forceSync(socket: SocketIO.Socket, data: any) {
		const socketInfo = this.findSocket(socket);

		if (!socketInfo)
			return;

		this._io.in(socketInfo.roomId).emit('room:player:sync', { user: socketInfo.userId, ...data });
	}
}