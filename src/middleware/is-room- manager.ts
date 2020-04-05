import Users, {IUser} from '../documents/user.interface';
import {NextFunction, Request, Response} from 'express';
import Rooms, {IRoom} from '../documents/room.interface';

export const isRoomManager =  async (req: Request, res: Response, next: NextFunction) =>{
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





    // @ts-ignore
    let roomUser = room.Users.find((usr) => usr.User._id.toString() == userObj._id.toString());

    // @ts-ignore
    if(roomUser.Role){
        // @ts-ignore
        if (roomUser.Role.PermissionLevel !== 1){

            // @ts-ignore
            if(room.Owner.toString() !== userObj._id.toString()) {
                return res.sendStatus(401);
            }
        }
    }


    next();
};
