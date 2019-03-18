const AWS = require('aws-sdk');
const moment = require('moment-timezone');
const _ = require('lodash');

AWS.config.update({region: 'us-east-1'});
AWS.config.setPromisesDependency(null);

const UserProfileTableName = 'User_Profile';
const DevicesTableName = 'Devices';

// Create the DynamoDB service object
const ddb = new AWS.DynamoDB({ apiVersion: 'latest' });
const doc = new AWS.DynamoDB.DocumentClient({
    convertEmptyValues: true,
    service: ddb
});

let methods = {};

methods.insert = (params) => {

};

methods.CreateUserProfile= (lwaUserId, tokens) => {
    const timeStamp = moment.utc(new Date()).tz('America/Toronto').format('X');
    const params = {
        TableName: UserProfileTableName,
        Item: {
            'user_id': lwaUserId,
            'auth_token': tokens.access_token,
            'refresh_token': tokens.refresh_token,
            'last_time_stamp': timeStamp
        }
    };
    console.log('DEBUG', `params: ${JSON.stringify(params)}`);
    // Call DynamoDB to add the item to the table
    return doc.put(params).promise();
};

methods.CreateDevices = (lwaUserId, devices) => {
    let promises = [];
    _.each(devices, (aDevice) => {
        const params = {};
        params.TableName = DevicesTableName;
        params.Item = {
            "endpoint_id": aDevice.endpointId,
            "user_id": lwaUserId,
            "friendly_name": aDevice.friendlyName
        };
//        params.UpdateExpression = "set devices = :d";
//        params.ExpressionAttributeValues = {
//            ":d": devices
//        };
//        params.ReturnValues = "UPDATED_NEW";
        console.log(`updating aDevice: ${JSON.stringify(params)}`);
        promises.push(doc.put(params).promise());
    });
    return promises;
};

methods.updateToken = (userId, newAccessToken ) => {
    const params = {
        TableName: UserProfileTableName,
        Key: {
            user_id: userId
        },
        UpdateExpression : "set auth_token = :a, last_time_stamp = :t",
        ExpressionAttributeValues: {
            ":a": newAccessToken,
            ":t": moment.utc(new Date()).tz('America/Toronto').format('X')
        },
        ReturnValues: "UPDATED_NEW"
    };
    console.log(`Updating token: ${JSON.stringify(params)}`);
    return doc.update(params).promise();
};

methods.getUserFromUserProfile = (userId) => {
    const params = {
        TableName: UserProfileTableName,
        Key:{
            "user_id": userId
        }
    };
    return doc.get(params).promise();
};

methods.getUserFromDevice = (endpointId) => {
    const params = {
        TableName: DevicesTableName,
        Key:{
            "endpoint_id": endpointId
        }
    };
    console.log(`sending query ${JSON.stringify(params)}`);
    return doc.get(params).promise();
};

module.exports = methods;