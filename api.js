const request = require('request-promise');
const moment = require('moment-timezone');
let methods = {};

const clientId = 'amzn1.application-oa2-client.<<your id>>';
const clientSecret = '<<amazon profile secret key>>';
const tokenUrl = 'https://api.amazon.com/auth/o2/token';
const eventGatewayUrl  = 'https://api.amazonalexa.com/v3/events';
let url = '';

methods.getCustomerProfile = function(accessToken) {
    const profileUrl = `https://api.amazon.com/user/profile?access_token=${encodeURIComponent(accessToken)}`;
    console.log(`customer profile url: ${profileUrl}`);
    return request.get({
        url: profileUrl,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'

        }
    });
};

methods.postDataPromise = function(methodName, directive, endpointId){
    let body = {};
    let headers = {
        'Content-Type' :'application/x-www-form-urlencoded'
    };
    switch(methodName) {
        case 'authorization_code':
            const authCode = directive.payload.grant.code;
            body = getTokenRequestBody(authCode, 'authorization_code');
            url = tokenUrl;
            break;
        case 'refresh_token':
            body = getTokenRequestBody(directive, 'refresh_token');
            url = tokenUrl;
            break;
        case 'event_gateway':
            body = getEventRequestBody(directive, endpointId);
            url = eventGatewayUrl;
            console.log(`request body: ${JSON.stringify(body)}`);
            return request.post({
                url: url,
                body: body,
                json: true
            });
            break;
        default:
            console.error('No valid method name found');
    }
    console.log(`request body: ${JSON.stringify(body)}`);
    return request.post({
        url: url,
        form: body,
        headers: headers
    });
};

/**
 * Generate a unique message ID
 *
 * TODO: UUID v4 is recommended as a message ID in production.
 */
function generateMessageID() {
    const messageId = (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).toUpperCase();
    return '38A28869-DD5E-48CE-BBE5-' + messageId;
    // return '38A28869-DD5E-48CE-BBE5-7022c3e6c9ff';
}

function getEventRequestBody(accessToken, endpointId) {
    const body = {
        "context": {},
        "event": {
            "header": {
                "messageId": generateMessageID(),
                "namespace": "Alexa",
                "name": "ChangeReport",
                "payloadVersion": "3"
            },
            "endpoint": {
                "scope": {
                    "type": "BearerToken",
                    "token": accessToken
                },
                "endpointId": endpointId
            },
            "payload": {
                "change": {
                    "cause": {
                        "type": "PHYSICAL_INTERACTION"
                    },
                    "properties": [
                        {
                            "namespace": "Alexa.ContactSensor",
                            "name": "detectionState",
                            "value": "DETECTED",
                            "timeOfSample": moment.utc().format(),
                            "uncertaintyInMilliseconds": 0
                        }
                    ]
                }
            }
        }
    };
    return body;
}

function getTokenRequestBody(authCode, grantType) {
    let params = {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type : grantType
    };
    if (grantType === 'refresh_token') {
       params.refresh_token = authCode;
    }
    if (grantType === 'authorization_code') {
        params.code = authCode;
    }
    return params;
}

module.exports = methods;