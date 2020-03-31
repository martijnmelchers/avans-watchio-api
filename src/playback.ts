import { Socket } from "socket.io";
import * as jwt from 'jsonwebtoken';
import User, {IUser} from './documents/user.interface';
import Room, {IRoom} from './documents/room.interface';

import {decode} from 'jsonwebtoken';

export class RoomManager {
    private _io: any;
    constructor(io: any) {
        this._io = io;
        this._io.on('connection', (socket: SocketIO.Socket) => this.onConnect(socket));
    }

    private onConnect(socket: Socket) {
        // Current room is also stored locally.
        socket.on('joinRoom',  (data) => this.joinRoom(socket, data));
        socket.on('createRoom', (data) => this.createRoom(socket, data));
        socket.on('addToQueue',(data)   => this.add(socket, data)) ;
    }


    // Adds the user to the room inside the database.
    async joinRoom(socket: Socket, data: any){
        const token = data.user;
        const user: IUser = await this.authenticate(token);
        const roomId: string = data.room;

        let room = await Room.findOne({Id: roomId}).populate({path: 'Users', model: 'User'});

        if(room){
            room.Users.push(user.toObject());
            room.save();

            console.log(room.toObject());
            socket.emit('joinedRoom', room.toObject());
        }
    }

    async createRoom(socket: Socket, data: any){
        const token = data.user;
        const user: IUser = await this.authenticate(token);
        const roomId: string = data.room;

        if(!await Room.exists({Id: roomId})){
            const roomObj = {
              Id: roomId,
            };
            await Room.create(roomObj)
        }

        this.joinRoom(socket, data);
    }

    add(socket: Socket, data: any){
        console.log(data);
    }

    private authenticate(token: string): Promise<IUser>{
        return new Promise<IUser>((resolve, reject) => {
            jwt.verify(token,'secret',(err, decoded:any) => {
                if(err) throw err;
                console.log(decoded);
                User.findOne({email: decoded.email}, (err, res: IUser) => {
                    resolve(res);
                });
            });
        });
    }
}

