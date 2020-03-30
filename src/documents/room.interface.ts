import mongoose, { Schema, Document } from 'mongoose';
import { QueueSchema } from './queue.interface';
import {UserSchema} from './user.interface';

export interface IRoom extends Document {
    Id: string;
    Queue: [Schema.Types.DocumentArray]
    Users: [Schema.Types.ObjectId]
}

const RoomSchema: Schema = new Schema({
    Id: {type: String, required: true, unique: true},
    Users: {type: [UserSchema], default: []},
    Queue: {type: QueueSchema}
});

export default mongoose.model<IRoom>('Room', RoomSchema)
