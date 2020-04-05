import Users, {IUser} from '../documents/user.interface';
import {NextFunction, Request, Response} from 'express';
import Rooms, {IRoom} from '../documents/room.interface';

export const isRoomAdmin =  async (req: Request, res: Response, next: NextFunction) =>{
    if (!req.params.roomId) return res.sendStatus(400);
    const user: IUser | undefined = req.user as IUser;
    const roomId: string = req.params.roomId;
    const room = await Rooms.findOne({Id: roomId}).populate({path: 'Users.User', model: 'User'}).populate({path: 'Users.Role', model: 'Role'}).exec();

    if(!room){
        return res.sendStatus(404);
    }

    //@ts-ignore
    let userObj = await Users.findOne({email: user.email}).exec();
    if(!userObj)
        return res.sendStatus(401);

    if ((room.Owner.toString() != userObj._id.toString())) {
        return res.sendStatus(401);
    }
    next();
};
