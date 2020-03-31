import mongoose, { Schema, Document } from 'mongoose';
import {QueueItemSchema} from './queue.interface';
import {UserSchema} from './user.interface';


export interface IRoom extends Document {
    Id: string;
    Queue: [Schema];
    Users: [Schema.Types.ObjectId];
}

const RoomSchema: Schema = new Schema({
    Id: {type: String, required: true},
    Users: {type: [Schema.Types.ObjectId], ref: 'User'},
    Queue: {type: [QueueItemSchema], required: false, default : null}
});
export default mongoose.model<IRoom>('Room', RoomSchema)

//
