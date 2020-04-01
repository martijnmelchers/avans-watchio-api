import express, {Express, NextFunction, Request, Response} from "express";
import bodyParser from 'body-parser';
import WebTorrent, {Torrent, TorrentFile} from "webtorrent";
import mongoose, {Connection} from 'mongoose';
import mime from 'mime';
import rangeParser from 'range-parser';
import pump from 'pump';
import SocketIO from "socket.io";
import {RoomManager} from './playback';
import App from './app';
import UserController from './controllers/user.controller';
import StreamController from './controllers/stream.controller';
import RoomController from './controllers/room.controller';
const port = 5000;

let AppInstance: App;
// Passport config.
require('./config/passport');


AppInstance = new App(5000);

const server = AppInstance.listen();
const client: WebTorrent.Instance = new WebTorrent();
const io = require("socket.io")(server);

AppInstance.initializeControllers([
    new UserController(),
    new StreamController(),
    new RoomController(io)
]);

mongoose.connect("mongodb://localhost/test", {useUnifiedTopology: true, useNewUrlParser: true});
mongoose.set('useFindAndModify', false);




const db: Connection = mongoose.connection;





const roomManager: RoomManager = new RoomManager(io);

const videoTypes: Array<string> = [
    "mp4",
    "mkv"
];

const torrentString = "magnet:?xt=urn:btih:B6E82665EF588BB6574DB1F9780A0279274F407D&dn=Aquaman+%282018%29+%5BWEBRip%5D+%5B1080p%5D+%5BYTS%5D+%5BYIFY%5D&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.com%3A2710%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.zer0day.to%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Fcoppersurfer.tk%3A6969%2Fannounce";
client.add(torrentString, (torrent: Torrent) => {
    torrent.on("done", () => {
        io.emit("done");

    });

    torrent.on("download", (bytes) => {
        io.emit("progress", {
            progress: torrent.progress,
            speed: torrent.downloadSpeed,
            peers: torrent.numPeers
        });
    });

    const videoFile = torrent.files.find(x => videoTypes.includes(x.name.substring(x.name.lastIndexOf(".") + 1)));
    if (videoFile)
        AppInstance.getController(StreamController.name).setFile(videoFile);
});

client.on("torrent", (a) => {
    console.log(`Torrent added! ${a.name}`);
    io.emit("ready");
});


db.once("open", () => {
    console.log("Boom! We're connected")
});

io.on("connection", (socket: SocketIO.Socket) => {
    console.log(`User connected! ${socket.id}`);
});


