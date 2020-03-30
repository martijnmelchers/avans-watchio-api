import mongoose, { Schema, Document } from 'mongoose';

export interface IQueueItem extends Document {
    Id: string;
    magnetUri: string;
}

export const QueueItemSchema: Schema = new Schema({
    Id: {type: String, required: true, unique: true},
    magnetUri: {type: String, required: true}
});


export interface IQueue extends Document {
    Id: string;
    Items: any;
}

export const QueueSchema: Schema = new Schema({
    Id: {type: String, required: true, unique: true},
    Items: {type: [QueueItemSchema], default: []},
});

export default mongoose.model<IQueue>('Queue', QueueSchema);
