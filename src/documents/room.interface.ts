import mongoose, { Schema, Document } from 'mongoose';
import { QueueSchema } from './queue.interface';

export interface IRoom extends Document {
    Id: string;
    Leven: string;
    Queue: [Schema.Types.DocumentArray]
}

const RoomSchema: Schema = new Schema({
    Id: {type: String, required: true, unique: true},
    Leven: {type: String, required: true, default: "Test"},
    Queue: {type: QueueSchema}
});

export default mongoose.model<IRoom>('Room', RoomSchema)
