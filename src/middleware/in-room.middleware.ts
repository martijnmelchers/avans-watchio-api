import Users, {IUser} from '../documents/user.interface';
import {NextFunction, Request, Response} from 'express';
import Rooms, {IRoom} from '../documents/room.interface';

export const inRoom =  async (req: Request, res: Response, next: NextFunction) =>{
    if (!req.params.roomId) return res.sendStatus(400);
    const user: IUser | undefined = req.user as IUser;
    const roomId: string = req.params.roomId;
    const room = await Rooms.findOne({Id: roomId}).populate({path: 'Users.User', model: 'User'}).exec();
    if(!room){
        return res.sendStatus(404);
    }

    // @ts-ignore
    if (!room.Users.find((usr) => usr.User.email == user.email)) {
        return res.sendStatus(401);
    }
    next();
};
