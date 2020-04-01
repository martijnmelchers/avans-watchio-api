import mongoose, { Schema, Document } from 'mongoose';
import {IQueueItem, QueueItemSchema} from './queue.interface';
import {UserSchema} from './user.interface';
import * as crypto from "crypto";


export interface IRoom extends Document {
    Id: string;
    // @ts-ignore
    Queue: [QueueItemSchema];
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
    Queue: {type: [Document], required: false, default : []},
    Hash:  {type: String, required:false},
    Salt: {type: String, required: false}
});


RoomSchema.methods.setPassword = function(password: string) {
    this.Salt = crypto.randomBytes(16).toString('hex');
    this.Hash = crypto.pbkdf2Sync(password, this.Salt, 10000, 512, 'sha512').toString('hex');
};


RoomSchema.methods.validatePassword = function(password: string) {
    const hash = crypto.pbkdf2Sync(password, this.Hash, 10000, 512, 'sha512').toString('hex');
    return this.Hash === hash;
};

export default mongoose.model<IRoom>('Room', RoomSchema)
