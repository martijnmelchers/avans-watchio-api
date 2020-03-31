import {default as express, Request, Response} from 'express';
import Rooms, {IRoom} from '../documents/room.interface';
import auth from '../config/auth';

class RoomController {
    public path = '/rooms';
    public router = express.Router();

    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(this.path, auth.required, this.getRooms);
        this.router.get(`${this.path}/:roomId`, auth.required, this.getRoom);
        this.router.post(`${this.path}`, auth.required, this.createRoom);
        this.router.delete(`${this.path}/:roomId`, auth.required, this.deleteRoom)
    }

     getRooms = async (req: Request, res: Response) => {
         res.json(await Rooms.find().populate({path: 'Users', model: 'User'}));
     };

    getRoom = async (req: Request, res: Response) => {
        if (!req.params.roomId) res.sendStatus(422);

        try{
            const room = await Rooms.findOne({Id: req.params.roomId}).populate({path: 'Users', model: 'User'});

            if(room == null){
                res.sendStatus(404);
            }
            res.json(room);
        }
        catch (e) {
            console.log(e);
        }

        res.status(404);
    };

    createRoom = async (req: Request, res: Response) => {
        const room = req.body;
        const roomObj: IRoom = await Rooms.create(room);
        return res.json(roomObj);
    };

    deleteRoom = (req: Request, res: Response) => {
        if (!req.params.roomId) res.sendStatus(422);
        const roomId = req.params.roomId;

        Rooms.deleteOne({Id: roomId}).then(() => {
            return res.sendStatus(200);

        }).catch((err) => {
            return res.sendStatus(404);
        });
    }
}

export default RoomController;
