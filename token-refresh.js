const db = require('./db-sensors');
const moment = require('moment-timezone');
const api = require('./api');
const _ = require('lodash');

let methods = {};
methods.refreshToken = (userId) => {
    return new Promise((resolve, reject) => {
        db.getUserFromUserProfile(userId).then((record) => {
            const row = record.Item;
            console.log(`profile from UserProfile: ${JSON.stringify(row)}`);
            const expiryTime = row.expires_in || 3600;
            if (!isValidToken(expiryTime, row.last_time_stamp)) {
                console.log('Token not valid need to refresh');
                api.postDataPromise('refresh_token', row.refresh_token).then((data) => {
                    // we got new token from alexa, update dynamodb
                    const updatedTokens = JSON.parse(data);
                    console.log(`new tokens: ${JSON.stringify(updatedTokens)}`);
                    db.updateToken(userId, updatedTokens.access_token).then((data) => {
                        resolve(data.Attributes);
                    }, (err) => {
                        console.error(`Error updating token in DB ${JSON.stringify(err)}`);
                        reject(err);
                    });
                }, (err) => {
                    console.error(`Error getting refresh token from alexa: ${JSON.stringify(err)}`);
                    reject(err);
                });
            } else {
                console.log('valid token');
                resolve(row);
            }
        }, (err) => {
            console.error(`error retrieving user profile ${err}`);
            reject(err);
        });
    });
};

function isValidToken(expiryTimeout, lastTimeStamp) {
    const lastTime = parseInt(lastTimeStamp);
    const currentTime = moment.utc(new Date()).tz('America/Toronto').format('X');
    console.log(`currentTime: ${currentTime} lastTimeStamp + expiryTimeout: ${_.add(lastTime + expiryTimeout)}`);
    return _.add(lastTime + expiryTimeout) > currentTime;
}

module.exports = methods;