import App from '../src/app';
import StreamController from '../src/controllers/stream.controller';
import SocketController from '../src/controllers/socket.controller';
import UserController from '../src/controllers/user.controller';
import RoomController from '../src/controllers/room.controller';
import {TmdbController} from '../src/controllers/tmdb.controller';
import {expect} from 'chai';
import request from 'supertest';
import Users, {IUser} from '../src/documents/user.interface';
import Rooms from '../src/documents/room.interface';
import jwt from 'jsonwebtoken';
import mongoose from "mongoose";
import {Response} from 'express';
import {IRoom} from '../src/documents/room.interface';
import socketClient from 'socket.io-client';

const AppInstance = new App(5000);
const server = AppInstance.listen();
const io = require("socket.io")(server);
const stream = new StreamController(io);
const socket = new SocketController(io, stream);

let discriminator =  Math.random().toString().substr(2, 4);
let email  = "test@super.me";
let newUser = new Users();
newUser.email = email;
newUser.email = "hashedclient@gmail.com";
newUser.setPassword("test");
newUser.profilePicture = "";
newUser.firstName = "Sascha";
newUser.lastName = "Mendel";
let token = "";



before((done) =>{
    AppInstance.initializeControllers([
        stream,
        new RoomController(io, stream, socket),
    ]);
    mongoose.connect("mongodb://localhost/test", { useUnifiedTopology: true, useNewUrlParser: true }, async () => {
        mongoose.set('useFindAndModify', false);
        await Rooms.deleteMany({}).exec();
        let savedUser = await  Users.findOne({email: newUser.email}).exec();
        if(savedUser){
            newUser = savedUser;
        }
        await createInviteableUser();
        if(!savedUser){
             newUser.save((err, user) => {
                if (err) done(err.message);
                else {
                    newUser = user;
                    token = jwt.sign(newUser.toAuthJSON(), 'secret');
                    done()
                }
            });
        }
        else{
            token = jwt.sign(savedUser.toAuthJSON(), 'secret');
            done();
        }
    });
});

describe('/ROOMS', function(){
    it( 'should return 200', function(done){
        request(AppInstance.getServer()).get('/rooms').set('Authorization', `Token ${token}`).send().end((err:any, res: any) =>{
            expect(res.status).to.equal(200);
            done();
        });
    });

    it( 'should return 401', function(done){
        request(AppInstance.getServer()).get('/rooms').send().end((err:any, res: any) =>{
            expect(res.status).to.equal(401);
            done();
        });
    });

    describe('POST', function (){
        it('create should return 200', function(done){
            request(AppInstance.getServer()).post('/rooms').set('Authorization', `Token ${token}`).send({
                Id: "ROOOM"
            }).end(function(err: any, res:any) {
                expect(res.status).to.equal(200);
                done();
            })
        });
    });

    describe('DELETE', function() {
        it('delete existing room should return 200', function(done){
            request(AppInstance.getServer()).delete('/rooms/ROOOM').set('Authorization', `Token ${token}`).send().end((err:any, res: any) =>{
                expect(res.status).to.equal(200);
                done();
            })
        });

        it('delete non existing room should return 404', function(done){
            request(AppInstance.getServer()).delete('/rooms/sausroom').set('Authorization', `Token ${token}`).send().end((err:any, res: any) =>{
                expect(res.status).to.equal(404);
                done();
            })
        });
    });


    describe('PUT/POST', function(){
        describe('USER', function(){
            let room:any= null;
            before( async ()=> {
                room = await createDummyRoom("test room xxx");
            });

            describe('INVITE', function() {


                it('invite user should return valid room',  function(done){

                     request(AppInstance.getServer()).post(`/rooms/${room.Id}/users`)
                     .set('Authorization', `Token ${token}`)
                     .send({
                        email: "hank@gmail.com"
                     }).end((err,  res) => {
                         expect(res.status).to.equal(200);
                         expect(res.body).to.have.property('Id');
                         done();
                     })
                });
            });

            describe('SETROLE', function() {
                it('setrole should return valid room',  function(done){
                    const roleEmail = "hank@gmail.com";
                    request(AppInstance.getServer()).put(`/rooms/${room.Id}/users/${roleEmail}`)
                        .set('Authorization', `Token ${token}`)
                        .send({
                            PermissionLevel: 1
                        }).end((err,  res) => {
                        expect(res.status).to.equal(200);
                        expect(res.body).to.have.property('Id');
                        done();
                    })
                });
            });
        });
    });

    describe('QUEUE', function(){
        let room:any= null;
        before( async ()=> {
            room = await createDummyRoom("queue room");
            stream.setupStream("magnet:?xt=urn:btih:6657edf8c89b81f0bc4cbcdf0526f7816587bf9d&dn=Pulp.Fiction.1994.1080p.BluRay.x264.DTS-ETRG&tr=udp%3a%2f%2f9.rarbg.me%3a2710%2fannounce&tr=udp%3a%2f%2ftracker.coppersurfer.tk%3a6969%2fannounce&tr=udp%3a%2f%2fthetracker.org%3a80%2fannounce&tr=udp%3a%2f%2ftracker.coppersurfer.tk%3a6969&tr=udp%3a%2f%2ftracker.leechers-paradise.org%3a6969%2fannounce&tr=udp%3a%2f%2feddie4.nl%3a6969%2fannounce&tr=udp%3a%2f%2fzer0day.ch%3a1337%2fannounce&tr=udp%3a%2f%2ftracker.sktorrent.net%3a6969%2fannounce&tr=udp%3a%2f%2f9.rarbg.to%3a2710%2fannounce&tr=udp%3a%2f%2ftracker.blackunicorn.xyz%3a6969%2fannounce&tr=udp%3a%2f%2ftracker.aletorrenty.pl%3a2710%2fannounce&tr=udp%3a%2f%2ftracker.piratepublic.com%3a1337%2fannounce&tr=udp%3a%2f%2ftracker.opentrackr.org%3a1337%2fannounce&tr=udp%3a%2f%2fglotorrents.pw%3a6969%2fannounce&tr=udp%3a%2f%2ftracker.zer0day.to%3a1337%2fannounce&tr=udp%3a%2f%2fcoppersurfer.tk%3a6969%2fannounce", room.Id);
        });

        it( 'should add to queue', function(done){
            request(AppInstance.getServer()).post(`/rooms/${room.Id}/queue`)
                .set('Authorization', `Token ${token}`)
                .send({
                    MagnetUri: "magnet:?xt=urn:btih:6657edf8c89b81f0bc4cbcdf0526f7816587bf9d&dn=Pulp.Fiction.1994.1080p.BluRay.x264.DTS-ETRG&tr=udp%3a%2f%2f9.rarbg.me%3a2710%2fannounce&tr=udp%3a%2f%2ftracker.coppersurfer.tk%3a6969%2fannounce&tr=udp%3a%2f%2fthetracker.org%3a80%2fannounce&tr=udp%3a%2f%2ftracker.coppersurfer.tk%3a6969&tr=udp%3a%2f%2ftracker.leechers-paradise.org%3a6969%2fannounce&tr=udp%3a%2f%2feddie4.nl%3a6969%2fannounce&tr=udp%3a%2f%2fzer0day.ch%3a1337%2fannounce&tr=udp%3a%2f%2ftracker.sktorrent.net%3a6969%2fannounce&tr=udp%3a%2f%2f9.rarbg.to%3a2710%2fannounce&tr=udp%3a%2f%2ftracker.blackunicorn.xyz%3a6969%2fannounce&tr=udp%3a%2f%2ftracker.aletorrenty.pl%3a2710%2fannounce&tr=udp%3a%2f%2ftracker.piratepublic.com%3a1337%2fannounce&tr=udp%3a%2f%2ftracker.opentrackr.org%3a1337%2fannounce&tr=udp%3a%2f%2fglotorrents.pw%3a6969%2fannounce&tr=udp%3a%2f%2ftracker.zer0day.to%3a1337%2fannounce&tr=udp%3a%2f%2fcoppersurfer.tk%3a6969%2fannounce",
                    tmdbId: 680
                }).end((err,  res) => {
                expect(res.status).to.equal(200);
                expect(res.body).to.have.property('Id');
                expect(res.body.Queue.length).to.equal(1);
                done();
            })
        });

        it( 'should remove from queue', function(done){
            request(AppInstance.getServer()).delete(`/rooms/${room.Id}/queue/1`)
                .set('Authorization', `Token ${token}`)
                .send().end((err,  res) => {
                expect(res.status).to.equal(200);
                expect(res.body).to.have.property('Id');
                expect(res.body.Queue.length).to.equal(0);
                done();
            })
        });

        it('should stream', function(done){
            const hash = "6657edf8c89b81f0bc4cbcdf0526f7816587bf9d";
            stream.once(`torrent:${hash}:ready`, () => {
                request(AppInstance.getServer()).get(`/stream/${hash}`).send().end((err, res) =>{
                    done();
                });
            });
        });
    })

});


async function createInviteableUser(): Promise<any>{
    let newUser = new Users();
    newUser.email = email;
    newUser.email = "hank@gmail.com";
    newUser.setPassword("test");
    newUser.profilePicture = "";
    newUser.firstName = "Sascha";
    newUser.lastName = "Mendel";


    let savedUser =await Users.findOne({email : newUser.email}).exec();
    if(!savedUser){
        return newUser.save();
    }
    else{
        return new Promise<any>((resolve, reject) =>{
            resolve(savedUser);
        });
    }
}

function createDummyRoom(roomId: string):Promise<IRoom>{
    return new Promise<IRoom>(async (resolve, reject) => {
        return resolve(await Rooms.create({Id: roomId, Owner: newUser._id, Users: [{User: newUser._id}]}));
    });
}

