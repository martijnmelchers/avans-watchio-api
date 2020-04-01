import express from 'express';
import bodyParser from 'body-parser';
import passport from 'passport';
import * as http from 'http';
const cors = require('cors');

class App {
    public app: express.Application;
    public port: number;
    private _controllers: any[]| undefined;
    private _server: http.Server | undefined;

    constructor(port: number) {
        this.app = express();
        this.port = port;

        this.initializeMiddlewares();
    }

    private initializeMiddlewares() {
        this.app.use(passport.initialize());
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded());
        this.app.use(cors());
    }

    public initializeControllers(controllers: any[]) {
        this._controllers = controllers;
        this._controllers.forEach((controller:any) => {
            this.app.use('/', controller.router);
        });
    }

    public getController(type:string){
        if(this._controllers){
            return this._controllers.find((controller) =>  controller.constructor.name == type);
        }
        return null;
    }

    public listen() {
        this._server = this.app.listen(this.port, () => {
            console.log(`App listening on the port ${this.port}`);
        });

        return this._server;
    }

    public getServer(): http.Server | undefined{
        return this._server;
    }
}
export default App;
