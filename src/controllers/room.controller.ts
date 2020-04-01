import {default as express, Request, Response} from 'express';
import Rooms, {IRoom} from '../documents/room.interface';
import auth from '../config/auth';
import Users, {IUser} from '../documents/user.interface';
import {Schema} from 'mongoose';
import {IQueueItem} from '../documents/queue.interface';
import {Server} from 'socket.io';
import App from '../app';

class RoomController {
    public path = '/rooms';
    public router = express.Router();
    private _app: App| undefined;
    private _io: Server | undefined;
    constructor(io: Server) {
        this._io = io;
        this.intializeRoutes();
    }


    public intializeRoutes() {
        this.router.get(this.path, auth.required, this.getRooms);
        this.router.post(`${this.path}/:roomId`, auth.required, (req, res) => this.joinRoom(req,res));
        this.router.post(`${this.path}/:roomId/leave`, auth.required, (req, res) => this.leaveRoom(req, res));
        this.router.get(`${this.path}/:roomId`, auth.required, this.getRoom);
        this.router.post(`${this.path}`, auth.required, this.createRoom);
        this.router.delete(`${this.path}/:roomId`, auth.required, this.deleteRoom);

        // Queue Routes
        this.router.post(`${this.path}/:roomId/queue`, auth.required, (req, res) => this.addToQueue(req,res));
        this.router.delete(`${this.path}/:roomId/queue/:queueItemPos`, auth.required, (req, res) => this.removeFromQueue(req,res));
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


        if(!user)
            return res.sendStatus(400);

        if(!room)
            return res.sendStatus(404);


        let authorized: boolean = true;
        if(room.hash){
            authorized = room.validatePassword(password);
        }

        if(!authorized)
            return res.sendStatus(401);

        const roomObj  = await Rooms.findByIdAndUpdate(room._id, {$addToSet: {Users: [userObj?._id]}}).exec();
        if(!roomObj)
            return res.sendStatus(500);

        this._io?.in(roomObj.Id).emit('roomChanged', roomObj);
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
        if(!roomObj)
            return res.sendStatus(500);


        this._io?.in(roomObj.Id).emit('roomChanged', roomObj);
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


    addToQueue = async(req: Request, res: Response) => {
        if (!req.params.roomId) res.sendStatus(400);
        const user: IUser | undefined = req.user as IUser;


        if(!this.isInRoom(user,req.params.roomId))
            return res.sendStatus(401);

        let room: IRoom| null | undefined= await Rooms.findOne({Id: req.params.roomId}).exec();
        if(!room)
            return res.sendStatus(404);

        const index: number = this.getQueueIndex(room);

        const queueItem = req.body;
        queueItem.Position = index + 1;

        room.Queue.push(queueItem);
        room = await room.save();
        if(!room)
            return res.sendStatus(500);

        this._io?.in(room.Id).emit('roomChanged', room.toObject());
        return res.json(room.toObject());
    };


    removeFromQueue = async (req: Request, res: Response) => {
        if (!req.params.roomId || !req.params.queueItemPos) res.sendStatus(400);
        const user: IUser | undefined = req.user as IUser;

        let room = await Rooms.findOne({Id: req.params.roomId}).exec();
        if(!room)
            return res.sendStatus(404);

        if(!this.isInRoom(user,req.params.roomId))
            return res.sendStatus(401);


        const posNum = Number(req.params.queueItemPos);
        // @ts-ignore
        Rooms.findOneAndUpdate({Id: room.Id}, {$pull: {Queue: {Position: posNum}}}, {new: true}, (err, updated) => {
            if(!updated)
                return res.sendStatus(500);

            this._io?.in(updated.Id).emit('roomChanged', updated);
            return res.json(updated);
        });
    };


    private isInRoom = async (user: IUser, roomId: string): Promise<boolean> => {
        return new Promise<boolean>(async (resolve, reject) => {
            const userObj = await Users.findOne({ email: user.email }).exec();
            if(!userObj)
                return resolve(false);

            const room = await Rooms.findOne({Id: roomId, Users: {$in: userObj?.toObject()}}).exec();
            return resolve(room != undefined);
        });
    }

    private getQueueIndex(room: IRoom): number{
        let index: number = 0;
        // @ts-ignore
        room.Queue.forEach((queueItem: IQueueItem) => {
            if(queueItem.Position >= index)
                index = queueItem.Position;
        });

        return index;
    }
}

export default RoomController;