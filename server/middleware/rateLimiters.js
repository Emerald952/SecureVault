const { rateLimit } = require('express-rate-limit');

//Login: 5 attempts per 15 minutes
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many login attempts!!! Please try again later.'
    }
});

//Get salt: 10 requests per 15 minutes
const saltLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests!!! Please try again later.'
    }
});

//Signup: 5 attempts per hour
const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many signup attempts!!! Please try again later.'
    }
});

module.exports = {
    loginLimiter,
    saltLimiter,
    signupLimiter
};