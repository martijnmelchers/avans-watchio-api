import mongoose, { Schema, Document } from 'mongoose';
import {QueueItemSchema} from './queue.interface';
import {UserSchema} from './user.interface';
import * as crypto from "crypto";


export interface IRoom extends Document {
    Id: string;
    Queue: [Schema];
    Users: [Schema.Types.ObjectId];
    Owner: Schema.Types.ObjectId;
    hash: string;
    salt: string;
    setPassword: Function;
    validatePassword: Function;
}

const RoomSchema: Schema = new Schema({
    Id: {type: String, required: true},
    Users: {type: [Schema.Types.ObjectId], ref: 'User', default: []},
    Owner: {type: Schema.Types.ObjectId, ref: 'User'},
    Queue: {type: [QueueItemSchema], required: false, default : null},
    hash:  {type: String, required:false},
    salt: {type: String, required: false}
});


RoomSchema.methods.setPassword = function(password: string) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
};


RoomSchema.methods.validatePassword = function(password: string) {
    const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
    return this.hash === hash;
};

export default mongoose.model<IRoom>('Room', RoomSchema)
