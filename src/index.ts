import WebTorrent, { Torrent } from "webtorrent";
import mongoose, { Connection } from 'mongoose';
import SocketIO from "socket.io";
import { RoomManager } from './playback';
import App from './app';
import UserController from './controllers/user.controller';
import StreamController from './controllers/stream.controller';
import RoomController from './controllers/room.controller';
import dotenv from 'dotenv';
import {TmdbService} from './services/tmdb.service';
// Configure .env file
dotenv.config();

const port = 5000;

let AppInstance: App;
// Passport config.
require('./config/passport');


AppInstance = new App(5000);

const server = AppInstance.listen();
const client: WebTorrent.Instance = new WebTorrent();
const io = require("socket.io")(server);


let stream = new StreamController(io);
AppInstance.initializeControllers([
	new UserController(),
    stream,
	new RoomController(io, stream)
]);

mongoose.connect("mongodb://localhost/test", { useUnifiedTopology: true, useNewUrlParser: true });
mongoose.set('useFindAndModify', false);


const db: Connection = mongoose.connection;




const roomManager: RoomManager = new RoomManager(io);

const videoTypes: Array<string> = [
	"mp4",
	"mkv"
];

// client.add(torrentString, (torrent: Torrent) => {
//     torrent.on("done", () => {
// 		io.emit("done");
//
// 	});
//
// 	torrent.on("download", (bytes) => {
// 		io.emit("progress", {
// 			progress: torrent.progress,
// 			speed: torrent.downloadSpeed,
// 			peers: torrent.numPeers
// 		});
// 	});
//
// 	const videoFile = torrent.files.find(x => videoTypes.includes(x.name.substring(x.name.lastIndexOf(".") + 1)));
// 	if (videoFile)
// 		AppInstance.getController(StreamController.name).setFile(videoFile);
// });




client.on("torrent", (a) => {
	console.log(`Torrent added! ${a.name}`);
	io.emit("ready");
});


db.once("open", () => {
	console.log("Connected to the database!");
});


