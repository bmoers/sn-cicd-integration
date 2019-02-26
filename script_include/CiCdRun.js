/* exported CiCdRun */
/* global gs, sn_ws, sn_ws_err, Class, GlideEncrypter, VirtualAppTools, GlideSecureRandomUtil, GlideUpdateSetWorker, GlideDateTime, GlideRecord, GlideProperties, JSON, SreLogger, VirtualAppAbstract, WsAbstractCore */

/**
 * CDCD Trigger to execute run in CICD Server
 * 
 * @class 
 * @author Boris Moers
 * @requires sn_ws.module:sys_script_include.RESTMessageV2
 * @memberof global.module:sys_script_include
 */
var CiCdRun = Class.create();

CiCdRun.prototype = /** @lends global.module:sys_script_include.CiCdRun.prototype */ {

    /**
     * Polyfill for Object.assign
     * 
     * @param {any} target
     * @param {any} arg
     * @returns {any} to
     */
    assign: function (target, arg) {
        if (target === null) {
            throw new TypeError('Cannot convert undefined or null to object');
        }
        var to = Object(target);
        for (var index = 1; index < arguments.length; index++) {
            var nextSource = arguments[index];
            if (nextSource != null) {
                for (var nextKey in nextSource) {
                    if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                        to[nextKey] = nextSource[nextKey];
                    }
                }
            }
        }
        return to;
    },


    /**
     * Constructor
     * 
     * @param {Object} settings
     * @returns {undefined}
     */
    initialize: function (settings) {
        var self = this;

        //var logger = new GSLog("com.sre.cicd", "CiCdRun");
        self.console = {
            log: function () {
                if (arguments.length) arguments[0] = '[CiCdRun] ' + arguments[0];
                gs.info.apply(null, arguments);
            },
            warn: function () {
                if (arguments.length) arguments[0] = '[CiCdRun] ' + arguments[0];
                gs.warn.apply(null, arguments);
            },
            error: function () {
                if (arguments.length) arguments[0] = '[CiCdRun] ' + arguments[0];
                gs.error.apply(null, arguments);
            },
            debug: function () {
                if (arguments.length) arguments[0] = '[CiCdRun] ' + arguments[0];
                gs.debug.apply(null, arguments);
            },
        };

        var cicdServerMatch = gs.getProperty('cicd-integration.server.url', '').match(/((?:http[s]?:\/\/)[^\/]*)/i);
        var cicdServer = (cicdServerMatch) ? cicdServerMatch[1] : 'server-undefined';

        self.settings = self.assign({
            cicdEnabled: Boolean(gs.getProperty('cicd-integration.enabled', 'false') == 'true'),
            cicdOnUpdateSetEnabled: Boolean(gs.getProperty('cicd-integration.enabled.on-update-set', 'false') == 'true'),
            cicdOnScopedAppsEnabled: Boolean(gs.getProperty('cicd-integration.enabled.on-scoped-app', 'false') == 'true'),
            throughMidServer: Boolean(gs.getProperty('cicd-integration.server.through-mid', 'false') == 'true'),
            midServerName: gs.getProperty('cicd-integration.server.mid-server-name', self.getMidServer()),
            cicdServerRunURL: cicdServer.concat('/run')
        }, JSON.parse(JSON.stringify(settings || {})));
    },


    /**
     * Example implementation of a Business-Rule to trigger the CICD Pipeline
     * 
     * @param {GlideRecord} current
     * @param {GlideRecord} previous
     * @returns {undefined}
     */
    sys_update_set_Before_IU: function (current, previous) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (!self.settings.cicdOnUpdateSetEnabled)
            return;

        if (gs.nil(current))
            return;

        if (!gs.isInteractive())
            return;

        if (current.state.changesTo('complete')) {

            // CICD enabled, run 
            current.setValue('state', 'build');
            self.now({
                updateSet: current.getValue('sys_id'),            // the update set to send to the pipeline
                application: {
                    id: current.getValue('application'),          // the id of the scope (or any other container grouping the application)
                    name: current.getDisplayValue('application')  // the name of the application
                },
                git: {
                    repository: current.getDisplayValue('application').toLowerCase().replace(/\s+/g, '_') // assuming the git repo shares the name with the scoped app
                }
            });
        }
    },

    /**
     * UI Action on sys_app to trigger the CICD Pipeline
     *
     * @param {GlideRecord} current
     * @returns {undefined}
     */
    sys_appUiAction: function (current) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (!self.settings.cicdOnScopedAppsEnabled)
            return;

        if (gs.nil(current))
            return;

        if (!gs.isInteractive())
            return;

        var cicdApi = new CiCdApi();
        var scopedUpdateSet = cicdApi.publishToUpdateSet(current.getValue('sys_id'));
        gs.addInfoMessage('Application exported as <a href="/sys_update_set.do?sys_id=' + scopedUpdateSet.updateSetSysId + '">update set</a>. CICD Process started.')

        self.now({
            updateSet: scopedUpdateSet.updateSetSysId,
            application: {
                id: current.getValue('sys_id'),             // the id of the application
                name: current.getValue('name')              // the name of the application
            },
            git: {
                repository: current.getValue('name').toLowerCase().replace(/\s+/g, '_') // assuming the git repo shares the name with the scoped app
            }
        });

    },

    /**
     * Send an Update-Set to the CICD Pipeline.
     * 
     * @param {any} opts for options see below
     * @returns {undefined}
     */
    now: function (opts) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        var user = gs.getUser();

        var options = self.assign({
            updateSet: null,                    // the sys_id of the update set or an application object {application: 'sys_id'} to be extracted
            application: {
                id: null,                       // either the sys_id of an application (scope) or the id of a container grouping files
                name: 'undefined'               // the name of the application / container
            },
            requestor: {
                userName: user.getName(),       // the person requesting the CICD pipeline to run
                fullName: user.getFullName(),   // full name of that person
                email: user.getEmail()          // email of same
            },
            atf: {
                updateSetOnly: false            // [optional] set to true if only ATF test IN the update-set shall be executed. if false it runs all test of the application.
            },
            git: {
                repository: 'undefined',        // git repo. e.g. 'sn-cicd.git'
                remoteUrl: null,                // [optional] repo full url with out git repo appended. e.g. 'ssh://git@github.com/project/repo.git'
                url: null                       // [optional] repo full url with out git repo appended. e.g. 'https://github.com/project/repo'
            },
            source: {
                name: gs.getProperty('glide.servlet.uri') // the source system of the update set e.g. https://companydev.service-now.com
            },
            master: {
                name: null                      // the master system of the update set. this must be production-like e.g. https://companypreprod.service-now.com
            },
            target: {
                name: null                      // the target system to deploy the update set e.g. https://companytest.service-now.com
            }
        }, JSON.parse(JSON.stringify(opts || {})));

        if (gs.nil(self.settings.cicdServerRunURL)) {
            throw 'Endpoint not defined';
        }

        self.console.log("sending data to target: {0}", self.settings.cicdServerRunURL);

        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'MID Server not defined';
            request.setMIDServer(self.settings.midServerName);
        }

        self.console.log('Settings {0}', JSON.stringify(self.settings));
        self.console.log('Options {0}', JSON.stringify(options));

        request.setEndpoint(self.settings.cicdServerRunURL);
        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Content-Type", "application/json");
        request.setHttpMethod('POST');

        request.setRequestBody(JSON.stringify(options));

        var response = request.execute(); // Async somehow does not perform
        if (!response.haveError()) {
            try {
                var responseText = response.getBody(),
                    responseJson = JSON.parse(responseText);
                if (responseJson) {
                    // TODO
                    // check response body for successful build start
                    self.console.log("successful - result is: {0}, text: {1}", responseJson, responseText);
                    return responseJson;
                }
            } catch (e) {
                self.console.error("JSON parsing failed. {0}", e);
                throw e;
            }

        } else {
            var statusCode = response.getStatusCode();
            self.console.error("request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}", statusCode, response.getErrorMessage(), self.settings.cicdServerRunURL, options);
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

};