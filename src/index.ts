import mongoose from 'mongoose';
import App from './app';
import UserController from './controllers/user.controller';
import StreamController from './controllers/stream.controller';
import RoomController from './controllers/room.controller';
import dotenv from 'dotenv';
import SocketController from './controllers/socket.controller';

dotenv.config();

// Passport config.
require('./config/passport');


const AppInstance = new App(5000);

const server = AppInstance.listen();
const io = require("socket.io")(server);


const stream = new StreamController(io);
const socket = new SocketController(io, stream);
AppInstance.initializeControllers([
	new UserController(),
	stream,
	new RoomController(io, stream, socket)
]);

mongoose.connect("mongodb://localhost/test", { useUnifiedTopology: true, useNewUrlParser: true });
mongoose.set('useFindAndModify', false);

mongoose.connection.once("open", () => {
	console.log("Connected to the database!");
});


