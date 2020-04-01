import express, { NextFunction, Request, Response } from "express";
import auth from '../config/auth';
import WebTorrent from 'webtorrent';
import pump from 'pump';
import rangeParser from 'range-parser';
import mime from "mime";

//
class StreamController {
	public path = '/stream';
	public router = express.Router();
	private _file: WebTorrent.TorrentFile | undefined;

	constructor() {
		this.intializeRoutes();
	}

	public setFile(file: WebTorrent.TorrentFile) {
		this._file = file;
	}

	public intializeRoutes() {
		this.router.get(this.path, this.getStream, auth.optional);
	}

	getStream = (req: Request, res: Response, next: NextFunction) => {

		if (this._file == null) {
			res.statusCode = 200;
			res.end();
			return;
		}

		res.statusCode = 200;
		res.setHeader('Content-Type', mime.getType(this._file.name) || 'application/octet-stream');

		// Support range-requests
		res.setHeader('Accept-Ranges', 'bytes');

		// Set name of file (for "Save Page As..." dialog)
		res.setHeader(
			'Content-Disposition',
			`inline; filename*=UTF-8''${this.encodeRFC5987(this._file.name)}`
		);

		// Support DLNA streaming
		res.setHeader('transferMode.dlna.org', 'Streaming');
		res.setHeader(
			'contentFeatures.dlna.org',
			'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=01700000000000000000000000000000'
		);

		// `rangeParser` returns an array of ranges, or an error code (number) if
		// there was an error parsing the range.
		let range = rangeParser(this._file.length, req.headers.range || '');

		if (Array.isArray(range)) {
			res.statusCode = 206; // indicates that range-request was understood

			// @ts-ignore
			// no support for multi-range request, just use the first range
			range = range[0];

			// @ts-ignore

			console.log(`START: ${range.start} END: ${range.end}, length: ${this._file.length}`);

			res.setHeader(
				'Content-Range',
				// @ts-ignore
				`bytes ${range.start}-${range.end}/${this._file.length}`
			);
			// @ts-ignore

			res.setHeader('Content-Length', range.end - range.start + 1);
		} else {
			// @ts-ignore

			range = null;
			res.setHeader('Content-Length', this._file.length);
		}

		if (req.method === 'HEAD') {
			return res.end();
		}
		// @ts-ignore

		pump(this._file.createReadStream(range), res);
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
}

export default StreamController;
