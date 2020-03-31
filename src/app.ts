import express from 'express';
import bodyParser from 'body-parser';
import {Server} from 'socket.io';
const cors = require('cors');

class App {
    public app: express.Application;
    public port: number;
    private _controllers: any[];

    constructor(controllers: any[], port: number) {
        this.app = express();
        this.port = port;
        this._controllers = controllers;


        this.initializeMiddlewares();
        this.initializeControllers();
    }

    private initializeMiddlewares() {
        this.app.use(bodyParser.json());
        this.app.use(bodyParser.urlencoded());
        this.app.use(cors());
    }

    private initializeControllers() {
        this._controllers.forEach((controller:any) => {
            this.app.use('/', controller.router);
        });
    }

    public getController(type:string){
        console.log(this._controllers);
        return this._controllers.find((controller) =>  controller.constructor.name == type);
    }

    public listen() {
        return this.app.listen(this.port, () => {
            console.log(`App listening on the port ${this.port}`);
        });
    }
}
export default App;
