import { Document, Schema } from 'mongoose';

export interface IQueueItem extends Document {
	Position: number;
	MagnetUri: string;
    Owner: Schema.Types.ObjectId;
}

export const QueueItemSchema: Schema = new Schema({
	Position: { type: Number, required: true, unique: true },
	MagnetUri: { type: String, required: true },
    Owner: { type: Schema.Types.ObjectId, ref: 'User' },
});
