methods = {};
const USER_DEVICES = [
    {
        "endpointId": "HondaGarageDoor-400605",
        "manufacturerName": "XCoder Inc.",
        "friendlyName": "Honda Garage Door sensor",
        "description": "Garage Door monitor",
        "displayCategories": [
            "CONTACT_SENSOR"
        ],
        "cookie": {},
        "capabilities": [
            {
                "type": "AlexaInterface",
                "interface": "Alexa.ContactSensor",
                "version": "3",
                "properties": {
                    "supported": [
                        {
                            "name": "detectionState"
                        }
                    ],
                    "proactivelyReported": true,
                    "retrievable": true
                }
            },
            {
                "type": "AlexaInterface",
                "interface": "Alexa.EndpointHealth",
                "version": "3",
                "properties": {
                    "supported": [
                        {
                            "name": "connectivity"
                        }
                    ],
                    "proactivelyReported": false,
                    "retrievable": true
                }
            }
        ]
    }
];

methods.getDevicesFromPartnerCloud = () => {
    return USER_DEVICES;
};

methods.isDeviceOnline = (applianceId, correlationToken, userAccessToken) => {
    console.log('DEBUG', `isDeviceOnline (applianceId: ${applianceId})`);
    /**
     * Always returns true for sample code.
     * You should update this method to your own validation.
     */
    return true;
};

module.exports = methods;