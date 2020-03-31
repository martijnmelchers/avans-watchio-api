import {default as express, Request, Response} from 'express';
import Rooms, {IRoom} from '../documents/room.interface';
import auth from '../config/auth';
import Users, {IUser} from '../documents/user.interface';
import {Schema} from 'mongoose';

class RoomController {
    public path = '/rooms';
    public router = express.Router();

    constructor() {
        this.intializeRoutes();
    }

    public intializeRoutes() {
        this.router.get(this.path, auth.required, this.getRooms);
        this.router.post(`${this.path}/:roomId`, auth.required, this.joinRoom);
        this.router.post(`${this.path}/:roomId/leave`, auth.required, this.leaveRoom);
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
        let room = req.body;
        const user: IUser | undefined = req.user as IUser;
        const userObj = await Users.findOne({ email: user.email }).exec();
        const password = room.password;
        room = room as IRoom;

        const roomModel = new Rooms(room);
        if(password){
            console.log(password);
            roomModel.setPassword(password);
        }
        roomModel.Owner = userObj?.toObject();
        roomModel.Users = [userObj?.toObject()];
        const roomObj: IRoom = await (await Rooms.create(roomModel)).populate({path: 'Users', model: 'User'}).execPopulate();
        res.json(roomObj);
    };

    joinRoom = async (req: Request, res:  Response) => {
        const roomId: string = req.params.roomId;
        const password = req.body.password;

        const user: IUser | undefined = req.user as IUser;

        const userObj = await Users.findOne({ email: user.email }).exec();
        const room = await Rooms.findOne({Id: roomId}).exec();
        if(!room)
            res.sendStatus(404);

        let authorized: boolean = true;
        if(room?.hash){
            authorized = room.validatePassword(password);
        }

        if(!authorized)
            return res.sendStatus(401);

        const roomObj  = await Rooms.findByIdAndUpdate(room?._id, {$addToSet: {Users: [userObj?._id]}}).exec();
        return res.json(roomObj);
    };


    leaveRoom = async (req: Request, res: Response) => {
        const roomId: string = req.params.roomId;
        const user: IUser | undefined = req.user as IUser;
        const userObj = await Users.findOne({ email: user.email }).exec();
        const room = await Rooms.findOne({Id: roomId}).exec();


        console.log(room?.Owner, userObj?._id);
        if(room?.Owner.toString() == userObj?._id.toString()){
            console.log("TRUEEEEE");
            await Rooms.findByIdAndDelete(room?._id).exec();
            return res.sendStatus(200);
        }

        const roomObj  = await Rooms.findOneAndUpdate({Id: roomId}, {$pull: {Users: {$in: [userObj?.toObject()]}}}).exec();
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
