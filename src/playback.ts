import SocketIO, { Socket } from "socket.io";
import * as jwt from 'jsonwebtoken';
import User, { IUser } from './documents/user.interface';
import Rooms, { IRoom } from './documents/room.interface';

export class RoomManager {
	private _io: SocketIO.Server;
	private socketInfo: { socketId: string, userId: string, roomId: string, ready: boolean }[] = [];

	constructor(io: any) {
		this._io = io;
		this._io.on('connection', (socket: Socket) => this.onConnect(socket));
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

		// Connect to the room.
		socket.join(room.Id);

		// Send the connected event and roomData to the client.
		socket.emit('room:connected', room.toObject());
		socket.emit('room:user:online', this.getOnlineUsers(room.Id));
		this._io.in(room.Id).emit('room:user:online', this.getOnlineUsers(room.Id));
		this._io.in(room.Id).emit('room:user:ready', this.getReadyUsers(room.Id));
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

				User.findOne({ email: decoded.email }, async (err, user: IUser) => {
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
				User.findOne({ email: decoded.email }, (err, res: IUser) => {
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

		socket.broadcast.to(socketInfo.roomId).emit('room:player:play', { user: socketInfo.userId, time: currentTime });
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

