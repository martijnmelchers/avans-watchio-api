import express, {Express, NextFunction, Request, Response} from "express";
import bodyParser from 'body-parser';
import WebTorrent, {Torrent, TorrentFile} from "webtorrent";
import mongoose, {Connection} from 'mongoose';
import mime from 'mime';
import rangeParser from 'range-parser';
import pump from 'pump';
import SocketIO from "socket.io";
import {RoomManager} from './playback';
const cors = require('cors');
const app: Express = express();
const port = 5000;

app.use(bodyParser.json()) // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded
app.use(cors());
app.use(require('./routes'));


// Passport config.
require('./config/passport');

const videoTypes: Array<string> = [
    "mp4",
    "mkv"
];

mongoose.connect("mongodb://localhost/test", {useUnifiedTopology: true, useNewUrlParser: true});



const db: Connection = mongoose.connection;

let file: TorrentFile;
const client = new WebTorrent();
const torrentString = "magnet:?xt=urn:btih:B6E82665EF588BB6574DB1F9780A0279274F407D&dn=Aquaman+%282018%29+%5BWEBRip%5D+%5B1080p%5D+%5BYTS%5D+%5BYIFY%5D&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.com%3A2710%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.zer0day.to%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Fcoppersurfer.tk%3A6969%2Fannounce";

const server = app.listen(port, () => {

    console.log(`Server started at http://localhost:${port}`);
});



const io = require("socket.io")(server);
const roomManager: RoomManager = new RoomManager(io);

db.once("open", () => {
    console.log("Boom! We're connected")
});

client.on("torrent", (a) => {
    console.log(`Torrent added! ${a.name}`);
    io.emit("ready");
});

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
        file = videoFile;
});


io.on("connection", (socket: SocketIO.Socket) => {
    console.log(`User connected! ${socket.id}`);
});


app.get("/", (req: Request, res: Response<{ running: boolean }>, next: NextFunction) => {
    res.json({running: true});
});


app.get("/stream", (req: Request, res: Response, next: NextFunction) => {

    if(file == null) {
        res.statusCode = 200;
        res.end();
        return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', mime.getType(file.name) || 'application/octet-stream');

    // Support range-requests
    res.setHeader('Accept-Ranges', 'bytes');

    // Set name of file (for "Save Page As..." dialog)
    res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeRFC5987(file.name)}`
    );

    // Support DLNA streaming
    res.setHeader('transferMode.dlna.org', 'Streaming');
    res.setHeader(
        'contentFeatures.dlna.org',
        'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
    );

    // `rangeParser` returns an array of ranges, or an error code (number) if
    // there was an error parsing the range.
    let range = rangeParser(file.length, req.headers.range || '');

    if (Array.isArray(range)) {
        res.statusCode = 206; // indicates that range-request was understood

        // @ts-ignore
        // no support for multi-range request, just use the first range
        range = range[0];

        // @ts-ignore

        console.log(`START: ${range.start} END: ${range.end}, length: ${file.length}`);

        res.setHeader(
            'Content-Range',
            // @ts-ignore
            `bytes ${range.start}-${range.end}/${file.length}`
        );
        // @ts-ignore

        res.setHeader('Content-Length', range.end - range.start + 1)
    } else {
        // @ts-ignore

        range = null;
        res.setHeader('Content-Length', file.length)
    }

    if (req.method === 'HEAD') {
        return res.end()
    }
    // @ts-ignore

    pump(file.createReadStream(range), res)
});

app.get("/stream-v2", (req: Request, res: Response) => {

    // fs.stat(file, function (err, stats) {
    //     if (err) {
    //         if (err.code === 'ENOENT') {
    //             // 404 Error if file not found
    //             return res.sendStatus(404);
    //         }
    //         res.end(err);
    //     }
    //     var range = req.headers.range;
    //     if (!range) {
    //         // 416 Wrong range
    //         return res.sendStatus(416);
    //     }
    //     var positions = range.replace(/bytes=/, "").split("-");
    //     var start = parseInt(positions[0], 10);
    //     var total = stats.size;
    //     var end = positions[1] ? parseInt(positions[1], 10) : total - 1;
    //     var chunksize = (end - start) + 1;
    //
    //     res.writeHead(206, {
    //         "Content-Range": "bytes " + start + "-" + end + "/" + total,
    //         "Accept-Ranges": "bytes",
    //         "Content-Length": chunksize,
    //         "Content-Type": "video/mp4"
    //     });
    //
    //     var stream = fs.createReadStream(file, {start: start, end: end})
    //         .on("open", function () {
    //             stream.pipe(res);
    //         }).on("error", function (err) {
    //             res.end(err);
    //         });
    // });
});

app.get("/finish", (req: Request, res: Response) => {
    client.remove(torrentString);
    res.send({deleted: true});
});


function encodeRFC5987(str: string) {
    return encodeURIComponent(str)
        // Note that although RFC3986 reserves "!", RFC5987 does not,
        // so we do not need to escape it
        .replace(/['()]/g, escape) // i.e., %27 %28 %29
        .replace(/\*/g, '%2A')
        // The following are not required for percent-encoding per RFC5987,
        // so we can allow for a little better readability over the wire: |`^
        .replace(/%(?:7C|60|5E)/g, unescape)
}


