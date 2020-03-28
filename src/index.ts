import express, {Request, Response, NextFunction, Express} from "express";
import WebTorrent, {Torrent, TorrentFile} from "webtorrent";
import mongoose, {Connection, Mongoose} from 'mongoose';
import mime from 'mime';
import rangeParser from 'range-parser';
import RangeParser from "range-parser";
import pump from 'pump';

const app: Express = express();

mongoose.connect("mongodb://localhost/test", {useUnifiedTopology: true, useNewUrlParser: true});


const db: Connection = mongoose.connection;
const port = 5000;
let file: TorrentFile;
const client = new WebTorrent();
const torrentString = "magnet:?xt=urn:btih:E156CE70FEE6464549FEF653C8468AECB3E7E9F1&dn=Black+Panther+%282018%29+%5BBluRay%5D+%5B1080p%5D+%5BYTS%5D+%5BYIFY%5D&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.com%3A2710%2Fannounce&tr=udp%3A%2F%2Fp4p.arenabg.com%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.zer0day.to%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Fcoppersurfer.tk%3A6969%2Fannounce";


db.once("open", () => {
    console.log("Boom! We're connected")
});

client.add(torrentString, (torrent: Torrent) => {
    var mp4 = torrent.files.find(x => x.name.endsWith(".mp4"));

    if (mp4)
        file = mp4;
});


app.get("/", (req: Request, res: Response<{ running: boolean }>, next: NextFunction) => {
    res.json({running: true});
});

app.get("/test", (req: Request, res: Response, next: NextFunction) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', mime.getType(file.name) || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');

    res.setHeader(
        'Content-Disposition',
        `inline; filename*=UTF-8''${encodeRFC5987(file.name)}`
    );


    // Support DLNA streaming
    res.setHeader('transferMode.dlna.org', 'Streaming')
    res.setHeader(
        'contentFeatures.dlna.org',
        'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
    );

    let range: RangeParser.Ranges | -1 | -2 | null = rangeParser(file.length, req.headers.range || '');

    function isValidRange(range: RangeParser.Ranges | -1 | -2 | null) {
        return range != -1 && range != -2 && range != null;
    }

    if (Array.isArray(range) && isValidRange(range)) {
        res.statusCode = 206; // indicates that range-request was understood

        // no support for multi-range request, just use the first range
        const firstRange = range[0];


        res.setHeader(
            'Content-Range',
            `bytes ${firstRange.start}-${firstRange.end}/${file.length}`
        );
        res.setHeader('Content-Length', firstRange.end - firstRange.start + 1)
    } else {
        range = null;
        res.setHeader('Content-Length', file.length)
    }

    if (req.method === 'HEAD') {
        return res.end();
    }

    if(!isValidRange(range))
        return res.end();

    // @ts-ignore
    pump(file.createReadStream(range), res)
});

app.listen(port, () => {

    console.log(`Server started at http://localhost:${port}`);
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