import mongoose, {Document, Schema} from 'mongoose';
import {IUser, UserSchema} from './user.interface';

export interface IRole extends Document {
    Name: string;
    PermissionLevel: number;
}

export const RoleSchema: Schema = new Schema({
    Name: { type: String, required: true, unique: true },
    PermissionLevel: {type: Number,  required: true, default: 1}
});
export default mongoose.model<IRole>('Role', RoleSchema);
