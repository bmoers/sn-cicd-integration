/**
 * Pull Request Proxy
 * 
 * @class 
 * @author Boris Moers [b.moers]
 * @requires sn_ws_err.module:sys_script_include.BadRequestError
 * @requires sn_ws.module:sys_script_include.RESTMessageV2
 * @memberof global.module:sys_script_include
 */
var CiCdWebHook = Class.create();
CiCdWebHook.prototype = /** @lends global.module:sys_script_include.CiCdWebHook.prototype */ {

    /**
     * Constructor
     * 
     * @param {any} request
     * @param {any} response
     * @returns {undefined}
     */
    initialize: function (request, response) {
        var self = this;

        self.console = {
            /**
             * Description
             * 
             * @returns {undefined}
             */
            log: function () {
                if (arguments.length) arguments[0] = '[' + self.type + '] ' + arguments[0];
                gs.info.apply(null, arguments);
            },
            /**
             * Description
             * 
             * @returns {undefined}
             */
            warn: function () {
                if (arguments.length) arguments[0] = '[' + self.type + '] ' + arguments[0];
                gs.warn.apply(null, arguments);
            },
            /**
             * Description
             * 
             * @returns {undefined}
             */
            error: function () {
                if (arguments.length) arguments[0] = '[' + self.type + '] ' + arguments[0];
                gs.error.apply(null, arguments);
            },
            /**
             * Description
             * 
             * @returns {undefined}
             */
            debug: function () {
                if (arguments.length) arguments[0] = '[' + self.type + '] ' + arguments[0];
                gs.debug.apply(null, arguments);
            },
        };

        self.request = request;
        self.response = response;

        self.proxyEnabled = Boolean(gs.getProperty('cicd-integration.pull-request-proxy.enabled', 'false') == 'true');

        var cicdServerMatch = gs.getProperty('cicd-integration.server.url', '').match(/((?:http[s]?:\/\/)[^\/]*)/i);
        var cicdServer = (cicdServerMatch) ? cicdServerMatch[1] : 'server-undefined';

        self.proxyURL = cicdServer.concat('/pull_request');
        self.secretName = gs.getProperty('cicd-integration.pull-request-proxy.header-secret-name', null);
        self.secretToken = gs.getProperty('cicd-integration.pull-request-proxy.secret', null);
        self.secretValidation = gs.getProperty('cicd-integration.pull-request-proxy.secret-validation', null);

        self.throughMidServer = Boolean(gs.getProperty('cicd-integration.server.through-mid', 'false') == 'true');
        self.midServerName = gs.getProperty('cicd-integration.server.mid-server-name', self.getMidServer());

        self.body = null;
        self.bodyString = null;
        try {
            // support for POST request
            var requestBody = request.body;
            self.bodyString = requestBody.dataString;
            if (requestBody && requestBody.hasNext()) {
                var body = requestBody.nextEntry();
                if (body) {
                    self.body = body;
                }
            }
        } catch (ignore) { }
    },

    /**
     * Proxy function to send the request to
     * 
     * @returns {undefined}
     */
    proxy: function () {
        var self = this;

        if (!self.proxyEnabled) {
            return new sn_ws_err.BadRequestError('Unauthorized');
        }

        if (!self.proxyURL) {
            return new sn_ws_err.BadRequestError('Unauthorized');
        }

        if (self.secretName) {
            if (!self.secretToken) {
                self.console.error('No Secret-Token specified! Set \'cicd-integration.pull-request-proxy.secret\' to a random string.');
                return new sn_ws_err.BadRequestError('Unauthorized');
            }
            // check the secrets to match
            var secret = self.request.getHeader(self.secretName);
            if (!secret) {
                self.console.error('No Secret passed! Header {0} is empty.', self.secretName);
                return new sn_ws_err.BadRequestError('Unauthorized');
            }

            if ('hmac' == self.secretValidation) {
                if (!secret.startsWith('sha1='))
                    return new sn_ws_err.BadRequestError('Unauthorized');

                /**
                 * Description
                 * 
                 * @param {any} byteArray
                 * @returns {any} 
                 */
                function toHex(byteArray) {
                    return byteArray.map(function (b) {
                        return ('0' + (b & 0xFF).toString(16)).slice(-2)
                    }).join('');
                }

                var base64 = SncAuthentication.encode(self.bodyString, self.secretToken, "HmacSHA1");
                var bytes = GlideStringUtil.base64DecodeAsBytes(base64);
                var hex = toHex(bytes);
                if (secret.split('sha1=')[1] != hex) {
                    self.console.warn('Proxy request made with invalid Token. Token not valid.');
                    return new sn_ws_err.BadRequestError('Unauthorized');
                }

            } else if ('match' == self.secretValidation) {
                if (self.secretToken != secret) {
                    self.console.warn('Proxy request made with invalid Token. Token does not match.');
                    return new sn_ws_err.BadRequestError('Unauthorized');
                }
            } else {
                return new sn_ws_err.BadRequestError('Unauthorized');
            }

        } else {
            self.console.warn('Proxy API is public! Request details - Headers: {0}, Body: {1}', JSON.stringify(self.request.headers), JSON.stringify(self.body));
        }

        var request = new sn_ws.RESTMessageV2();
        if (self.throughMidServer) {
            if (gs.nil(self.midServerName))
                throw new Error('MID Server not defined');
            request.setMIDServer(self.midServerName);
        }

        request.setEndpoint(self.proxyURL);
        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Content-Type", "application/json");
        request.setHttpMethod('POST');

        request.setRequestBody(self.bodyString);

        var response = request.execute(); // Async somehow does not perform
        if (!response.haveError()) {
            try {
                var responseText = response.getBody(),
                    responseJson = JSON.parse(responseText);
                if (responseJson) {
                    // TODO
                    // check response body for successful build start
                    self.console.log("successful - result is: {0}", responseText);
                    return responseJson;
                }
            } catch (e) {
                self.console.error("JSON parsing failed. {0}", e);
                throw e;
            }

        } else {
            var statusCode = response.getStatusCode();
            self.console.error("request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, ResponseBody: {3}", statusCode, response.getErrorMessage(), self.proxyURL, response.getBody());
            throw new Error(response.getErrorMessage());
        }
    },


    /**
     * Get one active mid server
     * 
     * @returns {any} name
     */
    getMidServer: function () {
        var name = null;
        var mid = new GlideRecord('ecc_agent');
        mid.addQuery('status', 'Up');
        mid.setLimit(1);
        mid.query();
        if (mid._next()) {
            name = mid.name.toString();
        }
        return name;
    },

    type: 'CiCdWebHook'
};