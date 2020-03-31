
import jwt from 'express-jwt';
import express from "express";

 const getTokenFromHeaders = (req: express.Request) => {
    const { headers: { authorization } } = req;

    if(authorization && authorization.split(' ')[0] === 'Token') {
      return authorization.split(' ')[1];
    }
    return null;
};


 const auth = {
    required: jwt({
        secret: 'secret',
        userProperty: 'payload',
        getToken: getTokenFromHeaders,
    }),
    optional: jwt({
        secret: 'secret',
        userProperty: 'payload',
        getToken: getTokenFromHeaders,
        credentialsRequired: false,
    }),
};

export = auth;
