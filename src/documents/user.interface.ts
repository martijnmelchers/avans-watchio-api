import mongoose, { Document, Schema } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';


export interface IUser extends Document {
	firstName: string;
	lastName: string;
	email: string;
	hash: string;
	salt: string;
	setPassword: Function,
	validatePassword: Function,
	toAuthJSON: Function,
	generateJWT: Function,
	googleId: string;
	facebookId: string;
	profilePicture: string;
}

export const UserSchema: Schema = new Schema({
	firstName: { type: String, required: true },
	lastName: { type: String, required: true },
	email: { type: String, required: true, unique: true },
	hash: { type: String, required: true },
	salt: { type: String, required: true },
	googleId: { type: String, required: false },
	facebookId: { type: String, required: false },
    profilePicture: {type: String, required: false}
});


UserSchema.methods.setPassword = function (password: string) {
	this.salt = crypto.randomBytes(16).toString('hex');
	this.hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
};


UserSchema.methods.validatePassword = function (password: string) {
	const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, 'sha512').toString('hex');
	return this.hash === hash;
};

UserSchema.methods.generateJWT = function () {
	const today = new Date();
	const expirationDate = new Date(today);
	expirationDate.setDate(today.getDate() + 60);

	return jwt.sign({
		email: this.email,
		id: this._id,
		exp: expirationDate.getTime() / 1000
	}, 'secret');
};

UserSchema.set('toJSON', {
	transform: function (doc, ret, options) {
		delete ret.Hash;
		delete ret.Salt;
		return ret;
	}
});

UserSchema.methods.toAuthJSON = function () {
	return {
		_id: this._id,
		email: this.email,
		token: this.generateJWT()
	};
};

export default mongoose.model<IUser>('User', UserSchema);

