
import {default as express, Request, Response} from 'express';
import {TmdbService} from '../services/tmdb.service';
import auth from '../config/auth';

export class TmdbController {
    public path = '/tmdb';
    public router = express.Router();
    constructor() {
        this.initializeRoutes();
    }

    private initializeRoutes(){
        this.router.get(`${this.path}/:query`, auth.required, (req, res) => this.getItems(req, res));
        this.router.get(`${this.path}/item/:itemId`, auth.required, (req, res) => this.getItem(req, res));
    }

    private async getItem(req: Request, res: Response){
        if(!req.params.itemId)
            return res.sendStatus(400);

        res.json(await TmdbService.getItem(Number(req.params.itemId)));
    }

    private async getItems(req: Request, res: Response){
        if(!req.params.query)
            return res.sendStatus(400);

        res.json(await TmdbService.searchItems(req.params.query));
    }
}

