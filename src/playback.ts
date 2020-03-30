import { Socket } from "socket.io";

export class RoomManager {
    private _io: any;
    constructor(io: any) {
        this._io = io;
        this._io.on('connection', (socket: SocketIO.Socket) => this.onConnect(socket));
    }

    private onConnect(socket: SocketIO.Socket) {
        // Current room is also stored locally.
        socket.on('joinRoom', function (data) {
            //TODO: Check if user is added to room.
            //TODO: send needed data to socket.

            //TODO, check if authorized.
            socket.join(data.room);
            console.log("Socket joined room: " + data.room);
        });

        socket.on('addToQueue', (data) => {
            console.log(this._io); //undefined
            this._io.in(data.room).emit('addToQueue', data.magnet);
        });
    }

    add(socket: SocketIO.Socket, data: any){
        console.log(data);
    }
}

