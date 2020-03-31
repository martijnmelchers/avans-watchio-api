import mongoose, { Schema, Document } from 'mongoose';

export interface IQueueItem extends Document {
    Id: string;
    magnetUri: string;
}
export const QueueItemSchema: Schema = new Schema({
    Id: {type: String, required: true},
    magnetUri: {type: String, required: true}
});
