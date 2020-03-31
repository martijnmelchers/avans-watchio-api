import {default as express, Request, Response} from 'express';
import Rooms, {IRoom} from '../documents/room.interface';
import auth from '../config/auth';

class RoomController {
    public path = '/controllers';
    public router = express.Router();

    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get('/', auth.required, this.getRooms);
        this.router.post('/', auth.required, this.createRoom);
        this.router.get('/:roomId', auth.required, this.getRoom);
        this.router.delete('/:roomId', auth.required, this.deleteRoom)
    }

    getRooms = (req: Request, res: Response) => {
        return res.json(Rooms)
    };

    getRoom = async (req: Request, res: Response) => {
        if (!req.params.roomId) res.status(422);
        const room = await Rooms.findOne({Id: req.params.roomId}).populate('User').populate('Queue');
        if (!room)
            return res.status(404);

        return res.json(room);
    };

    createRoom = async (req: Request, res: Response) => {
        const room = req.body;
        const roomObj: IRoom = await Rooms.create(room);
        return res.json(roomObj);
    };

    deleteRoom = (req: Request, res: Response) => {
        if (!req.params.roomId) res.status(422);
        const roomId = req.params.roomId;

        Rooms.deleteOne({Id: roomId}).then(() => {
            return res.status(200);

        }).catch((err) => {
            return res.status(404);
        });
    }
}
