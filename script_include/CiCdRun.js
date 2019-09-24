/* exported CiCdRun */
/* global CiCdApi */

/**
 * CDCD Trigger to execute run in CICD Server
 * 
 * @class 
 * @author Boris Moers
 * @requires global.module:sys_script_include.CiCdApi
 * @requires sn_ws.module:sys_script_include.RESTMessageV2
 * @memberof global.module:sys_script_include
 */
var CiCdRun = Class.create();

CiCdRun.prototype = /** @lends global.module:sys_script_include.CiCdRun.prototype */ {

    REQUIRES_REVIEW: 'conflict_review',

    PROTECTED_STATES: ['complete', 'build', 'build_in_progress', 'code_review_pending', 'deployment_in_progress', 'conflict_review_in_progress', 'conflict_review_passed', 'deployment_manual_interaction'],

    /**
     * Polyfills for Object.assign
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
            }
        };

        var cicdServerMatch = gs.getProperty('cicd-integration.server.url', '').match(/((?:http[s]?:\/\/)[^\/]*)/i);
        var cicdServer = (cicdServerMatch) ? cicdServerMatch[1] : 'server-undefined';

        self.settings = self.assign({
            cicdServer: cicdServer,
            cicdEnabled: Boolean(gs.getProperty('cicd-integration.enabled', 'false') == 'true'),
            cicdOnUpdateSetEnabled: Boolean(gs.getProperty('cicd-integration.enabled.on-update-set', 'false') == 'true'),
            cicdOnScopedAppsEnabled: Boolean(gs.getProperty('cicd-integration.enabled.on-scoped-app', 'false') == 'true'),
            cicdBuildStateMessageEnabled: Boolean(gs.getProperty('cicd-integration.message.build-state', 'false') == 'true'),
            throughMidServer: Boolean(gs.getProperty('cicd-integration.server.through-mid', 'false') == 'true'),
            midServerName: gs.getProperty('cicd-integration.server.mid-server-name', self.getMidServer()),
            cicdServerRunURL: cicdServer.concat('/run'),
            cicdServerPreviewCompleteURL: cicdServer.concat('/preview-complete'),
            cicdServerDeploymentCompleteURL: cicdServer.concat('/deployment-complete'),
        }, JSON.parse(JSON.stringify(settings || {})));
    },


    /**
     * display warning message on sys_remote_update_set
     * 
     * @param {any} current
     * @returns {undefined}
     */
    sys_remote_update_set_Display: function (current) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (gs.action.getGlideURI().getMap().get('sysparm_view') != 'cicd_preview')
            return;

        if (current.getValue('state') == 'committed')
            return;

        if (GlidePreviewProblemHandler.hasUnresolvedProblems(current.sys_id)) {
            gs.addErrorMessage("<p><b>[CICD]</b> Please resolve the conflicts below.<br>'Skip' will ignore the record during future deployments. 'Accept' will force the record during future deployments.<br>If the update set contains unwanted changes, click on 'Cancel Run [CICD]'.</p>");
            current.setWorkflow(false);
        } else {
            gs.addInfoMessage("<p><b>[CICD]</b> To continue the pipeline, please confirm the preview problems now.<br>If the update set contains unwanted changes, click on 'Cancel Run [CICD]'.</p>");
            current.setWorkflow(false);
        }

    },

    /**
     * Display link to build state on sys_update_set
     * 
     * @param {any} current
     * @returns {undefined}
     */
    sys_update_set_Display: function (current) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (!self.settings.cicdBuildStateMessageEnabled)
            return;

        if (gs.nil(current))
            return;

        if (!gs.nil(current.installed_from))
            return;

        var url = self.settings.cicdServer.concat('/goto/us/').concat(current.getValue('sys_id'));

        switch (current.getValue('state')) {

            case 'conflict_review_in_progress':
                gs.addInfoMessage('CICD: Conflict review in <a href="'.concat(url).concat('" target="_blank">progress</a>'));
                break;

            case 'conflict_review_passed':
                gs.addInfoMessage('CICD: Conflict review <a href="'.concat(url).concat('" target="_blank">passed</a>'));
                break;

            case 'build':
                gs.addInfoMessage('CICD: Build is <a href="'.concat(url).concat('" target="_blank">requested</a>'));
                break;

            case 'build_in_progress':
                gs.addInfoMessage('CICD: Build is in <a href="'.concat(url).concat('" target="_blank">progress</a>'));
                break;

            case 'code_review_pending':
                gs.addInfoMessage('CICD: Code review <a href="'.concat(url).concat('" target="_blank">pending</a>'));
                break;

            case 'code_review_rejected':
                gs.addErrorMessage('CICD: Code review <a href="'.concat(url).concat('" target="_blank">rejected</a>'));
                break;

            case 'deployment_in_progress':
                gs.addInfoMessage('CICD: Deployment in <a href="'.concat(url).concat('" target="_blank">progress</a>'));
                break;

            case 'deployment_manual_interaction':
                gs.addInfoMessage('CICD: Deployment requires manual <a href="'.concat(url).concat('" target="_blank">interaction</a>'));
                break;

            case 'build_failed':
                gs.addErrorMessage('CICD: Build <a href="'.concat(url).concat('" target="_blank">failed</a>'));
                break;

            case 'complete':
                gs.addInfoMessage('CICD: Build is <a href="'.concat(url).concat('" target="_blank">complete</a>'));
                break;

            default:

        }
    },



    /**
     * Async inform CICD server if sys_remote_update_set is completed
     * 
     * @param {any} current
     * @returns {undefined}
     */
    sys_remote_update_set_After_IU: function (current) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (current.state.changesTo('committed')) {
            var resolutions = self.getResolutions(current.getValue('sys_id'));

            self.deploymentComplete({
                isInteractive: gs.isInteractive(),
                remoteUpdateSetID: current.getValue('sys_id'),
                resolutions: resolutions
            })
        }
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

        var state = current.getValue('state');
        var prevState = previous.getValue('state');

        // don't allow user to change the state during a CICD run
        // except to 'Do not transport' and 'ignore'
        if (current.state.changes() && !current.state.changesTo('Do not transport') && !current.state.changesTo('ignore') && self.PROTECTED_STATES.indexOf(prevState) != -1) {
            gs.addErrorMessage('You can\'t manually change the state from \'' + prevState + '\' to \'' + state + '\'');
            current.state.setValue(prevState);
            return current.setAbortAction(true);
        }

        if (current.state.changesTo('complete')) {
            try {
                // CICD enabled, run 
                current.setValue('state', 'build');
                self.now({
                    updateSet: current.getValue('sys_id'),            // the update set to send to the pipeline
                    application: {
                        id: current.getValue('application'),          // the id of the scope (or any other container grouping the application)
                        name: current.getDisplayValue('application')  // the name of the application
                    },
                    git: {
                        repository: ((current.application.scope.toString() == 'global') ? current.getDisplayValue('application') : current.application.scope.toString()).toLowerCase().replace(/\s+/g, '_') // assuming the git repo shares the name with the scoped app
                    }
                });
            } catch (e) {
                self.console.error(e);
                gs.addErrorMessage(e);
            }
        }
    },


    /**
     * Helper function to check if there is already a pending job for an application
     * (via the auto generated update set)
     * 
     * @param {any} currentSysApp
     * @returns {ConditionalExpression} 
     */
    _getAppUpdateSetInProgress: function (currentSysApp) {
        var self = this;
        if (!self.settings.cicdEnabled)
            return false;
        if (gs.nil(currentSysApp))
            return false;

        var singleUpdateSet = Boolean(gs.getProperty('cicd-integration.scoped-app.single-update-set', 'false') == 'true');
        if (!singleUpdateSet)
            return false;

        var sysId = new GlideChecksum(currentSysApp.getValue('name').concat(currentSysApp.getValue('version'), currentSysApp.getValue('sys_id'), gs.getProperty('instance_name'))).getMD5();

        var checkUs = new GlideRecord('sys_update_set');
        checkUs.addQuery('sys_id', sysId);
        checkUs.addQuery('state', '!=', 'complete');
        checkUs.addQuery('state', '!=', 'ignore');
        checkUs.addQuery('state', '!=', 'Do not transport');
        checkUs.setLimit(1);
        checkUs.query();
        return (checkUs._next()) ? checkUs : false;
    },

    /**
     * UI Action condition function to show or hide the "Build this Application [CICD]" button
     * 
     * @param {any} currentSysApp
     * @returns {ConditionalExpression} 
     */
    showBuildThisApplicationUiAction: function (currentSysApp) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return false;

        if (!self.settings.cicdOnScopedAppsEnabled)
            return false;

        if (gs.nil(currentSysApp))
            return false;

        if (currentSysApp.vendor == 'ServiceNow')
            return false;

        if (!currentSysApp.canWrite())
            return false;

        return (self._getAppUpdateSetInProgress(currentSysApp)) ? false : true;
    },

    /**
     * Display Business Rule on sys_app
     * 
     * @param {any} currentSysApp
     * @returns {undefined}
     */
    sys_app_Display: function (currentSysApp) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (!self.settings.cicdOnScopedAppsEnabled)
            return;

        if (gs.nil(currentSysApp))
            return;

        // only show the message if there is a update set in progress
        var us = self._getAppUpdateSetInProgress(currentSysApp);
        if (us) {
            var url = self.settings.cicdServer.concat('/goto/us/').concat(us.getValue('sys_id'));
            return gs.addInfoMessage('There is a CICD run in <a href="' + url + '" target="_blank">progress</a> for this application.<br>Please wait for it to end or in case of failure set the <a href="' + us.getLink(true) + '">update set</a> to \'ignore\' state and start over again.');
        }
    },

    /**
     * UI Action on sys_app to trigger the CICD Pipeline
     * 
     * @param {GlideRecord} currentSysApp
     * @returns {undefined}
     */
    sys_appUiAction: function (currentSysApp) {
        var self = this;
        try {
            if (!self.settings.cicdEnabled)
                return;

            if (!self.settings.cicdOnScopedAppsEnabled)
                return;

            if (gs.nil(currentSysApp))
                return;

            if (!gs.isInteractive())
                return;

            var cicdApi = new CiCdApi();
            var scopedUpdateSet = cicdApi.publishToUpdateSet(currentSysApp.getValue('sys_id'));

            gs.addInfoMessage('Application exported as <a href="/sys_update_set.do?sys_id=' + scopedUpdateSet.updateSetSysId + '">update set</a>. CICD Process started.')

            self.now({
                updateSet: scopedUpdateSet.updateSetSysId,
                application: {
                    id: currentSysApp.getValue('sys_id'), // the id of the application
                    name: currentSysApp.getValue('name')  // the name of the application
                },
                git: {
                    repository: ((currentSysApp.getValue('scope') == 'global') ? currentSysApp.getValue('name') : currentSysApp.getValue('scope')).toLowerCase().replace(/\s+/g, '_') // assuming the git repo shares the name with the scoped app
                }
            });
        } catch (e) {

            if (e.code == "ALREADY_RUNNING") {
                return gs.addErrorMessage('There is already a <a href="' + e.link + '">CICD run</a> in progress for this application.');
            }

            gs.error(e);
        }
    },



    /**
     * Rule to display the cancel ui action
     * 
     * @param {any} current
     * @returns {LogicalExpression}
     */
    sys_remote_updateDisplayCancelUiAction: function (current) {
        return (gs.getProperty('cicd-integration.enabled', 'false') == 'true' && current.state == 'conflict_review' && current.canWrite())
    },

    /**
     * UI Action on sys_remote_update to cancel CICD run
     * 
     * @param {GlideRecord} current
     * @param {any} action
     * @returns {undefined}
     */
    sys_remote_updateCancelUiAction: function (current, action) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (gs.nil(current))
            return;

        if (!gs.isInteractive())
            return;

        if (current.getValue('state') != self.REQUIRES_REVIEW)
            return gs.addErrorMessage('This update set is not in the conflict preview state');

        try {
            var result = self.preview({
                doCancel: true,
                remoteUpdateSetID: current.getValue('sys_id')
            });
            current.deleteRecord();
            action.setRedirectURL(self.settings.cicdServer.concat(result.url));
        } catch (e) {
            self.console.error(e);
            gs.addErrorMessage(e);
            action.setRedirectURL(current);
        }
    },


    /**
     * Rule to display the confirm ui action
     * 
     * @param {any} current
     * @returns {LogicalExpression}
     */
    sys_remote_updateDisplayConfirmUiAction: function (current) {
        return (gs.getProperty('cicd-integration.enabled', 'false') == 'true' && current.state == 'conflict_review' && !GlidePreviewProblemHandler.hasUnresolvedProblems(current.sys_id) && current.canWrite())
    },


    /**
     * UI Action on sys_remote_update to confirm collisions
     * 
     * @param {GlideRecord} current
     * @param {any} action
     * @returns {undefined}
     */
    sys_remote_updateConfirmUiAction: function (current, action) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (gs.nil(current))
            return;

        if (!gs.isInteractive())
            return;

        if (current.getValue('state') != self.REQUIRES_REVIEW)
            return gs.addErrorMessage('This update set is not in the conflict preview state');


        var resolutions = self.getResolutions(current.getValue('sys_id'));

        try {
            var result = self.preview({
                doCancel: false,
                remoteUpdateSetID: current.getValue('sys_id'),
                resolutions: resolutions
            });
            current.deleteRecord();
            action.setRedirectURL(self.settings.cicdServer.concat(result.url));
        } catch (e) {
            self.console.error(e);
            gs.addErrorMessage(e);
            action.setRedirectURL(current);
        }
    },


    /**
     * Get all resolutions of a remote_update_set
     * 
     * @param {string} remoteUpdateSetID the sysId of the remote_update_set
     * @returns {any}
     */
    getResolutions: function (remoteUpdateSetID) {
        var resolutions = {};
        var prb = new GlideRecord('sys_update_preview_problem');
        prb.addQuery('remote_update_set', remoteUpdateSetID);
        prb.query();
        while (prb._next()) {

            var updateName = prb.remote_update.getRefRecord().getValue('name');

            var file = new GlideRecord("sys_metadata");
            var sysId = null,
                className = null,
                updatedOn = 0;

            if (file.get("sys_update_name", updateName)) {
                sysId = file.getValue('sys_id');
                className = file.getValue('sys_class_name');
                updatedOn = new GlideDateTime(file.getValue('sys_updated_on')).getNumericValue();
            } else {
                // fall back in case of e.g. 'sys_app'
                const m = updateName.match(/(^.*)_([0-9a-f]{32})$/m);
                if (m) {
                    sysId = m[2];
                    className = m[1];
                    file = new GlideRecord(className);
                    if (file.get(sysId)) {
                        updatedOn = new GlideDateTime(file.getValue('sys_updated_on')).getNumericValue();
                    }
                }
            }

            resolutions[updateName] = {
                status: prb.getValue('status'), // skipped = 'Skip remote update'; ignored = 'Accept remote update',
                resolvedBy: (prb.getValue('status')) ? prb.getValue('sys_updated_by') : null,
                sysId: sysId,
                className: className,
                updatedOn: updatedOn,
                host: gs.getProperty('glide.servlet.uri'),
            }
        }
        return resolutions;
    },


    /**
     * Send preview results back to CICD pipeline.
     * 
     * @param {any} opts for options see below
     * @returns {undefined}
     */
    preview: function (opts) {

        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        if (gs.nil(self.settings.cicdServerPreviewCompleteURL)) {
            throw '[preview] Endpoint not defined';
        }

        var user = gs.getUser();
        var options = self.assign({
            doCancel: true,
            remoteUpdateSetID: null,
            user: {
                name: user.getName(),       // the person confirmed the collision
                fullName: user.getFullName(),   // full name of that person
                email: user.getEmail()          // email of same
            },
            resolutions: {}
        }, JSON.parse(JSON.stringify(opts || {})));


        if (!options.doCancel && GlidePreviewProblemHandler.hasUnresolvedProblems(options.remoteUpdateSetID)) {
            throw '[preview] Update set has unresolved problems';
        }

        self.console.log("[preview] sending data to target: {0}", self.settings.cicdServerPreviewCompleteURL);

        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw '[previewComplete] MID Server not defined';
            request.setMIDServer(self.settings.midServerName);
        }

        self.console.log('[preview] Settings {0}', JSON.stringify(self.settings));
        self.console.log('[preview] Options {0}', JSON.stringify(options));

        request.setEndpoint(self.settings.cicdServerPreviewCompleteURL);
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
                    self.console.log("[preview] successful - result is: {0}, text: {1}", responseJson, responseText);
                    return responseJson;
                }
            } catch (e) {
                self.console.error("[preview] JSON parsing failed. {0}", e);
                throw e;
            }

        } else {
            var statusCode = response.getStatusCode();
            self.console.error("[preview] request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}", statusCode, response.getErrorMessage(), self.settings.cicdServerPreviewCompleteURL, options);
            throw new Error(response.getErrorMessage());
        }

    },


    /**
     * Send deployment completed results back to CICD pipeline.
     * 
     * @param {any} opts for options see below
     * @returns {undefined}
     */
    deploymentComplete: function (opts) {
        var self = this;

        if (!self.settings.cicdEnabled)
            return;

        var user = gs.getUser();
        var options = self.assign({
            remoteUpdateSetID: null,
            host: gs.getProperty('glide.servlet.uri'),
            user: {
                name: user.getName(),
                fullName: user.getFullName(),
                email: user.getEmail()
            },
            resolutions: {}
        }, JSON.parse(JSON.stringify(opts || {})));


        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw '[previewComplete] MID Server not defined';
            request.setMIDServer(self.settings.midServerName);
        }

        self.console.log('[deploymentComplete] Settings {0}', JSON.stringify(self.settings));
        self.console.log('[deploymentComplete] Options {0}', JSON.stringify(options));

        request.setEndpoint(self.settings.cicdServerDeploymentCompleteURL);
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
                    self.console.log("[deploymentComplete] successful - result is: {0}, text: {1}", responseJson, responseText);
                    return responseJson;
                }
            } catch (e) {
                self.console.error("[deploymentComplete] JSON parsing failed. {0}", e);
                throw e;
            }

        } else {
            var statusCode = response.getStatusCode();
            self.console.error("[deploymentComplete] request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}", statusCode, response.getErrorMessage(), self.settings.cicdServerDeploymentCompleteURL, options);
            throw new Error(response.getErrorMessage());
        }

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

    type: 'CiCdRun'
};
