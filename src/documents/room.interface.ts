import mongoose, { Document, Schema } from 'mongoose';
import { QueueItemSchema } from './queue.interface';
import * as crypto from "crypto";


export interface IRoom extends Document {
	Id: string;
	// @ts-ignore
	Queue: [QueueItemSchema];
	Users: [Schema.Types.ObjectId];
	Owner: Schema.Types.ObjectId;
	Hash: string;
	Salt: string;
	Password: boolean;
	setPassword: Function;
	validatePassword: Function;
}


const UserRoleSchema = new Schema({
    User: {type: Schema.Types.ObjectId, ref: 'User', required: true},
    Roles: {type: [Schema.Types.ObjectId], ref: 'Role',default: []}
});

const RoomSchema: Schema = new Schema({
	Id: { type: String, required: true },
	Users: { type: [UserRoleSchema], default: [] },
	Owner: { type: Schema.Types.ObjectId, ref: 'User' },
	Queue: { type: [Document], required: false, default: [] },
	Hash: { type: String, required: false },
	Salt: { type: String, required: false },
    Password: {type: Boolean, required: false, default: false}
});


RoomSchema.methods.setPassword = function (password: string) {
    this.Password = true;
	this.Salt = crypto.randomBytes(16).toString('hex');
	this.Hash = crypto.pbkdf2Sync(password, this.Salt, 10000, 512, 'sha512').toString('hex');
};

RoomSchema.set('toJSON', {
    transform: function(doc, ret, options) {
        delete ret.Hash;
        delete ret.Salt;
        return ret;
    }
});
RoomSchema.methods.validatePassword = function (password: string) {
	const hash = crypto.pbkdf2Sync(password, this.Salt, 10000, 512, 'sha512').toString('hex');
	return this.Hash === hash;
};

export default mongoose.model<IRoom>('Room', RoomSchema);
