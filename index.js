const api = require('./api');
const db = require('./db-sensors');
const devices = require('./devices');
const _ = require('lodash');
const tokenService = require('./token-refresh');


/**
 * Utility functions
 */

function log(title, msg) {
    console.log(`[${title}] ${msg}`);
}


/**
 * Generate a unique message ID
 *
 * TODO: UUID v4 is recommended as a message ID in production.
 */
function generateMessageID() {
    //"JCPO1KCBWP84H";
    const messageId = (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).toUpperCase();
    return '38A28869-DD5E-48CE-BBE5-' + messageId;
    // return '38A28869-DD5E-48CE-BBE5-7022c3e6c9ff';
}

/**
 * Generate a response message
 *
 * @param {string} name - Directive name
 * @param {Object} payload - Any special payload required for the response
 * @returns {Object} Response object
 */
function generateDoorResponse(endpointId, token, correlationToken) {
    return {
        "context": {
            "properties": [
                {
                    "namespace": "Alexa.ContactSensor",
                    "name": "detectionState",
                    "value": "NOT_DETECTED",
                    "timeOfSample": new Date().toISOString(),
                    "uncertaintyInMilliseconds": 0
                }
            ]
        },
        "event": {
            "header": {
                "namespace": "Alexa",
                "name": "StateReport",
                "messageId": generateMessageID(),
                "correlationToken": correlationToken,
                "payloadVersion": "3"
            },
            "endpoint": {
                "endpointId": endpointId,
                "cookie": {}
            },
            "payload": {}
        }
    };
}

function reportState(endpointId, token, correlationId) {
    return generateDoorResponse(endpointId, token, correlationId);
}

function generateErrorResponse(endpointId, correlationToken, token, payload) {
    return {
        event: {
            header: {
                namespace: 'Alexa',
                name: 'ErrorResponse',
                payloadVersion: '3',
                messageId: generateMessageID(),
                correlationToken: correlationToken
            },
            endpoint: {
                scope: {
                    type: 'BearerToken',
                    token: token
                },
                endpointId: endpointId,
            },
            payload: payload
        }
    };
}

/**
 * https://developer.amazon.com/docs/device-apis/alexa-authorization.html
 * @param request
 * @param callback
 */
function handleAuthorization(directive, callback) {
    const userAccessToken = directive.payload.grantee.token.trim();
    const correlationToken = '';
    const endpointId = '';

    const respToAlexa = {
        "event": {
            "header": {
                "messageId": directive.messageId,
                "namespace": "Alexa.Authorization",
                "name": "AcceptGrant.Response",
                "payloadVersion": "3"
            },
            "payload": {
            }
        }
    };

    function failedAcceptGrantResponse(response, endpointId, correlationToken, userAccessToken) {
        console.error(`Error getting token from LWA:${response.statusCode}`);
        return callback(null, generateErrorResponse(endpointId, correlationToken, userAccessToken,
            {
                type: 'ACCEPT_GRANT_FAILED',
                message: `Failed to handle AcceptGrant directive: ${response.statusCode}`
            })
        );
    }

    api.getCustomerProfile(userAccessToken).then((resp) => {
        const lwaUserId = JSON.parse(resp).user_id;
        log('INFO', `customer userId:${lwaUserId}`);
        api.postDataPromise('authorization_code', directive).then((response) => {
            log('INFO', `resp: ${JSON.stringify(response)}`);
            const tokens = JSON.parse(response);
            log('DEBUG', `body: ${response}: tokens: ${tokens}`);
            db.CreateUserProfile(lwaUserId, tokens).then((data) => {
                log('DEBUG', `DB data:${JSON.stringify(data)}`);
                return callback(null, respToAlexa);
            }).catch(function (err) {
                log('ERROR',`Database error ${err}`);
                return callback(null, failedAcceptGrantResponse(response));
            });
        }, (err) => {
            return callback(null, failedAcceptGrantResponse(err));
        });
    }, (err) => {
        log('ERROR', `error in customer profile ${err}`);
        return callback(null, failedAcceptGrantResponse(err));
    });
}

/**
 * This function is invoked when we receive a "Discovery" message from Alexa Smart Home Skill.
 * We are expected to respond back with a list of appliances that we have discovered for a given customer.
 *
 * @param {Object} request - The full request object from the Alexa smart home service. This represents a DiscoverAppliancesRequest.
 *     https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesrequest
 *
 * @param {function} callback - The callback object on which to succeed or fail the response.
 *     https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html#nodejs-prog-model-handler-callback
 *     If successful, return <DiscoverAppliancesResponse>.
 *     https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#discoverappliancesresponse
 */
function handleDiscovery(request, callback) {
    log('DEBUG', `Discovery Request: ${JSON.stringify(request)}`);
    const userAccessToken = request.payload.scope.token.trim();

    if (!userAccessToken || !isValidToken(userAccessToken)) {
        const errorMessage = `Discovery Request [${request.header.messageId}] failed. Invalid access token: ${userAccessToken}`;
        log('ERROR', errorMessage);
        callback(new Error(errorMessage));
    }

    function failedDiscoveryResponse(){
        return {
            event: {
                header: {
                    namespace: 'Alexa',
                    name: 'ErrorResponse',
                    payloadVersion: '3',
                    messageId: generateMessageID(),
                }
            },
            endpoints: [],
            payload: {
                type: "INTERNAL_ERROR",
                message: "Unable to reach endpoint 12345 because it appears to be offline"
            }
        };
    }

    api.getCustomerProfile(userAccessToken).then((res) => {
        const appliances = devices.getDevicesFromPartnerCloud(userAccessToken);
        const deviceEndpoints = _.map(appliances, (anAppliance) => {
            return  {
                'endpointId' : anAppliance.endpointId,
                'friendlyName': anAppliance.friendlyName
            };
        });
        const lwaUserId = JSON.parse(res).user_id;
        Promise.all(db.CreateDevices(lwaUserId, deviceEndpoints))
            .then((data) => {
            log('DEBUG', `DB data:${JSON.stringify(data)}`);
            const discoveryResponse = {
                event: {
                    header: {
                        namespace: 'Alexa.Discovery',
                        name: 'Discover.Response',
                        payloadVersion: '3',
                        messageId: generateMessageID(),
                    },
                    payload: {
                        endpoints: appliances
                    },
                }
            };
            log('DEBUG', `sending response to alexa: ${JSON.stringify(discoveryResponse)}`);
            return callback(null, discoveryResponse);
        }).catch(function (err) {
            log('ERROR',`Database error ${err}`);
            return callback(null, failedDiscoveryResponse());
        });
    }, (err) => {
        log('ERROR', `Failed to get customer userId :${JSON.stringify(err)}`);
        return callback(null, failedDiscoveryResponse());
    });
}

function isValidToken() {
    // TODO: check the DB timestamp and reauest new token
    return true;
}

/**
 * Main entry point.
 * Incoming events from Alexa service through Smart Home API are all handled by this function.
 *
 * It is recommended to validate the request and response with Alexa Smart Home Skill API Validation package.
 *  https://github.com/alexa/alexa-smarthome-validation
 */
exports.handler = (request, context, callback) => {
    log('DEBUG', `request: ${JSON.stringify(request)}`);
    log('DEBUG', `context: ${JSON.stringify(context)}`);
    if (request.status) {
        // We have AWS IoT message, find out from which userId and device and send to alexa event gateway
        log('DEBUG', `fetching user profile for ${request.endpointId}`);
        db.getUserFromDevice(request.endpointId).then((data) => {
            log(`DEBUG`, `userFromDevice ${JSON.stringify(data)}`);
            const lwaUserId  = data.Item.user_id;
            tokenService.refreshToken(lwaUserId).then((token) => {
                log('INFO', `YEY!! We can now send door open event to Alexa Gateway!! ${JSON.stringify(token)}`);
                api.postDataPromise("event_gateway", token.auth_token, request.endpointId)
                    .then((data) => {
                        log('INFO', `Successfully sent the details ${data}`);
                    }, (er) => {
                        log('ERROR', `Error sending event ${er}`);
                    });
                //
            }, (errors) => {
                log('ERROR', `Could not refresh token ${errors}`);
            });
        }, (err) => {
            log('ERROR', `error retrieving userProfile from endpointId ${err}`);
        });
    } else {
        const directive = request.directive;
        switch (request.directive.header.namespace) {

            case 'Alexa.Authorization':
                log('DEBUG', `Inside Authorization:payload ${JSON.stringify(request.directive.payload)}`);
                handleAuthorization(directive, callback);
                break;

            case 'Alexa':
                log('DEBUG', `Inside Alexa: ${request.directive.header.name}`);
                handleControl(directive, callback);
                break;
            /**
             * The namespace of 'Alexa.Discovery' indicates a request is being made to the Lambda for
             * discovering all appliances associated with the customer's appliance cloud account.
             *
             * For more information on device discovery, please see
             *  https://developer.amazon.com/docs/device-apis/alexa-discovery.html
             */
            case 'Alexa.Discovery':
                log('DEBUG', `Inside Discovery` + callback);
                handleDiscovery(directive, callback);
                break;

            /**
             * Received an unexpected message
             */
            default: {
                const errorMessage = `No supported namespace: ${directive.header.namespace}`;
                log('ERROR', errorMessage);
                callback(new Error(errorMessage));
            }
        }
    }
};

/**
 * A function to handle control events.
 * This is called when Alexa requests an action such as turning off an appliance.
 *
 * @param {Object} directive - The full request object from the Alexa smart home service.
 * @param {function} callback - The callback object on which to succeed or fail the response.
 */
function handleControl(directive, callback) {
    log('DEBUG', `Control Request: ${JSON.stringify(directive)}`);

    /**
     * Get the access token.
     */
    const userAccessToken = directive.endpoint.scope.token.trim();
    const correlationToken = directive.header.correlationToken;
    /**
     * Grab the endpointId from the request.
     */
    const endpointId = directive.endpoint.endpointId;
    /**
     * Generic stub for validating the token against your cloud service.
     * Replace isValidToken() function with your own validation.
     *
     * If the token is invliad, return InvalidAccessTokenError
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#invalidaccesstokenerror
     */
    if (!userAccessToken || !isValidToken(userAccessToken)) {
        log('ERROR', `Discovery Request [${directive.header.messageId}] failed. Invalid access token: ${userAccessToken}`);
        callback(generateErrorResponse(endpointId, correlationToken, userAccessToken, {}));
        return;
    }


    /**
     * If the applianceId is missing, return UnexpectedInformationReceivedError
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#unexpectedinformationreceivederror
     */
    if (!endpointId) {
        log('ERROR', 'No endpointId provided in request');
        const payload = {type: 'NO_SUCH_ENDPOINT', message: `endpointId: Invalid endpoint`};
        callback(generateErrorResponse(endpointId, correlationToken, userAccessToken, payload));
        return;
    }

    /**
     * At this point the applianceId and accessToken are present in the request.
     *
     * Please review the full list of errors in the link below for different states that can be reported.
     * If these apply to your device/cloud infrastructure, please add the checks and respond with
     * accurate error messages. This will give the user the best experience and help diagnose issues with
     * their devices, accounts, and environment
     *  https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/smart-home-skill-api-reference#error-messages
     */
    if (!devices.isDeviceOnline(endpointId, correlationToken, userAccessToken)) {
        log('ERROR', `Device offline: ${endpointId}`);
        const payload = {
            "type": "ENDPOINT_UNREACHABLE",
            "message": "Unable to reach endpoint because it appears to be offline"
        };
        callback(generateErrorResponse(endpointId, correlationToken, userAccessToken, payload));
        return;
    }

    let response;

    switch (directive.header.name) {
        case 'ReportState':
            response = reportState(endpointId, userAccessToken, correlationToken);
            break;
        default: {
            log('ERROR', `No supported directive name: ${directive.header.name}`);
            const payload = {type: 'INVALID_DIRECTIVE', message: `Invalid directive name ${directive.header.name}`};
            callback(generateErrorResponse(endpointId, correlationToken, userAccessToken, payload));
            return;
        }
    }
    log('DEBUG', `Control Confirmation: ${JSON.stringify(response)}`);

    callback(null, response);
}