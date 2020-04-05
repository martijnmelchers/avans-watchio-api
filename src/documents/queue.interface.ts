import { Document, Schema } from 'mongoose';

export interface IQueueItem extends Document {
	Position: number;
	MagnetUri: string;
    Owner: Schema.Types.ObjectId;
    InfoHash: string;
    Release: Date;
    Title: string;
}

export const QueueItemSchema: Schema = new Schema({
	Position: { type: Number, required: true },
	MagnetUri: { type: String, required: true},
    InfoHash: {type: String, required: true},
    Owner: { type: Schema.Types.ObjectId, ref: 'User' },
    Title: {type: String, required: false},
    Release: {type: Date, required: false}
});
