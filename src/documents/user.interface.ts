import mongoose, { Schema, Document } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

export interface IRole extends Document {
    Name: string;
}

const RoleSchema: Schema = new Schema({
    Name: {type: String, required: true}
});


export interface IUser extends Document {
    email: string;
    hash: string;
    roles: [Schema.Types.ObjectId],
    salt: string;
    setPassword: Function,
    validatePassword: Function,
    toAuthJSON: Function,
    generateJWT: Function,
}

const UserSchema: Schema = new Schema({
    email: {type: String, required: true, unique: true},
    hash: {type: String, required: true},
    salt:  {type: String, required: true},
    role: {type: [RoleSchema], required: true}
});


UserSchema.methods.setPassword = function(password: string) {
    this.salt = crypto.randomBytes(16).toString('hex');
    this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
};


UserSchema.methods.validatePassword = function(password: string) {
    const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
    return this.hash === hash;
};

UserSchema.methods.generateJWT = function(){
    const today = new Date();
    const expirationDate = new Date(today);
    expirationDate.setDate(today.getDate() + 60);

    return jwt.sign({
        email: this.email,
        id: this._id,
        exp: expirationDate.getTime() / 1000,
    }, 'secret');
}

UserSchema.methods.toAuthJSON = function() {
    return {
      _id: this._id,
      email: this.email,
      token: this.generateJWT(),
    };
};

export default mongoose.model<IUser>('User', UserSchema)

