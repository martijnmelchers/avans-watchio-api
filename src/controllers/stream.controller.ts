import express, { NextFunction, Request, Response } from "express";
import auth from '../config/auth';
import WebTorrent from 'webtorrent';
import pump from 'pump';
import rangeParser from 'range-parser';
import mime from "mime";
import { Server } from 'socket.io';
import rimraf from 'rimraf';

//
class StreamController {
	private static videoTypes: Array<string> = [
		"mp4",
		"mkv"
	];
	public path = '/stream';
	public router = express.Router();
	private _file: WebTorrent.TorrentFile | undefined;
	private _io: Server;
	private _client: WebTorrent.Instance;

	constructor(io: Server) {
		this._client = new WebTorrent();
		this._io = io;
		this.intializeRoutes();
	}

	public setFile(file: WebTorrent.TorrentFile) {
		this._file = file;
	}

	public intializeRoutes() {
		this.router.get(`${this.path}/:hash`, auth.optional, this.getStream);
	}


	public setupStream(magnetUri: string, room: string) {
		let torrent = this._client.get(magnetUri);
		if (torrent) {
			console.log(torrent.infoHash);
			return torrent.infoHash;
		}

		this._client.add(magnetUri, ((torrent) => {
			console.log(torrent.infoHash);
			torrent.on('done', () => this.onDone(torrent, room));
			// @ts-ignore
			torrent.on('download', (bytes) => this.onProgress(torrent, room));

			return torrent.infoHash;
		}));
	}

	public stopStream(magnetUri: string, room: string): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			let torrent = this._client.get(magnetUri) as WebTorrent.Torrent;
			if (!torrent) {
				return resolve(undefined);
			}
			this._client.remove(torrent, ((err) => {
				if (err) {
					return reject(err);
				}
				rimraf(torrent.path, (err) => {
					if (err) reject(err);
					return resolve(torrent.infoHash);
				});
			}));
		});
	}


	public sendProgress(magnetUris: string[], roomId: string) {
		magnetUris.forEach((magnetUri) => {
			let torrent = this._client.get(magnetUri) as WebTorrent.Torrent;

			if (torrent.done) {
				this.onDone(torrent, roomId);
				return;
			}

			let torrentData = {
				progress: torrent.progress,
				speed: torrent.downloadSpeed,
				peers: torrent.numPeers,
				hash: torrent.infoHash
			};
			this._io.to(roomId).emit('room:torrent:progress', torrentData);
		});
	}

	getStream = (req: Request, res: Response, next: NextFunction) => {
		if (!req.params.hash)
			return res.sendStatus(400);

		const torrentFile = this.getTorrentFile(req.params.hash);

		if (torrentFile == null) {
			res.statusCode = 404;
			res.end();
			return;
		}

		res.statusCode = 206;
		res.setHeader('Content-Type', mime.getType(torrentFile.name) || 'application/octet-stream');

		// Support range-requests
		res.setHeader('Accept-Ranges', 'bytes');

		// Set name of file (for "Save Page As..." dialog)
		res.setHeader(
			'Content-Disposition',
			`inline; filename*=UTF-8''${this.encodeRFC5987(torrentFile.name)}`
		);

		// Support DLNA streaming
		res.setHeader('transferMode.dlna.org', 'Streaming');
		res.setHeader(
			'contentFeatures.dlna.org',
			'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
		);

		// `rangeParser` returns an array of ranges, or an error code (number) if
		// there was an error parsing the range.
		let range = rangeParser(torrentFile.length, req.headers.range || '');

		if (Array.isArray(range)) {
			res.statusCode = 206; // indicates that range-request was understood

			// @ts-ignore
			// no support for multi-range request, just use the first range
			range = range[0];

			res.setHeader(
				'Content-Range',
				// @ts-ignore
				`bytes ${range.start}-${range.end}/${torrentFile.length}`
			);
			// @ts-ignore

			res.setHeader('Content-Length', range.end - range.start + 1);
		} else {
			// @ts-ignore

			range = null;
			res.setHeader('Content-Length', torrentFile.length);
		}

		if (req.method === 'HEAD') {
			return res.end();
		}
		// @ts-ignore

		pump(torrentFile.createReadStream(range), res);
	};

	getTorrentFile = (torrentInfoHash: string) => {
		const torrent = this._client.torrents.find((trnt) => trnt.infoHash == torrentInfoHash);
		if (!torrent)
			return null;

		let videoFile: WebTorrent.TorrentFile | undefined;

		let files = torrent.files.filter(x => StreamController.videoTypes.includes(x.name.substring(x.name.lastIndexOf(".") + 1)));

		files.sort((file) => file.length);
		videoFile = files.pop();

		if (!videoFile)
			null;

		return videoFile;
	};

	encodeRFC5987 = (str: string) => {
		return encodeURIComponent(str)
			// Note that although RFC3986 reserves "!", RFC5987 does not,
			// so we do not need to escape it
			.replace(/['()]/g, escape) // i.e., %27 %28 %29
			.replace(/\*/g, '%2A')
			// The following are not required for percent-encoding per RFC5987,
			// so we can allow for a little better readability over the wire: |`^
			.replace(/%(?:7C|60|5E)/g, unescape);
	};

	private onProgress(torrent: WebTorrent.Torrent, roomId: string) {
		this._io.to(roomId).emit("room:torrent:progress", {
			progress: torrent.progress,
			speed: torrent.downloadSpeed,
			peers: torrent.numPeers,
			hash: torrent.infoHash
		});
	}

	private onDone(torrent: WebTorrent.Torrent, roomId: string) {
		this._io.to(roomId).emit('room:torrent:done', {
			hash: torrent.infoHash
		});
	}
}

export default StreamController;
