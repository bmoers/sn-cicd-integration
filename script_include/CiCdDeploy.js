/* exported CiCdDeploy */
/* global gs, sn_ws, sn_ws_err, Class, GlideEncrypter, VirtualAppTools, GlideSecureRandomUtil, GlideUpdateSetWorker, GlideDateTime, GlideRecord, GlideProperties, JSON, SreLogger, VirtualAppAbstract, WsAbstractCore */

/**
 * CD API to request target instance to pull update set
 * 
 * @class 
 * @author Boris Moers
 * @requires sn_ws_err.module:sys_script_include.BadRequestError
 * @requires sn_ws.module:sys_script_include.RESTMessageV2
 * @memberof global.module:sys_script_include
 */
var CiCdDeploy = Class.create();

CiCdDeploy.prototype = {


    REST_BEARER: gs.getProperty('cicd-integration.deploy.oauth'),

    assign: function (target) {
        if (target === null) { // TypeError if undefined or null
            throw new TypeError('Cannot convert undefined or null to object');
        }
        var to = Object(target);

        for (var index = 1; index < arguments.length; index++) {
            var nextSource = arguments[index];

            if (nextSource !== null) { // Skip over if undefined or null
                for (var nextKey in nextSource) {
                    // Avoid bugs when hasOwnProperty is shadowed
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
     * @param {any} request
     * @param {any} response
     * @returns {undefined}
     */
    initialize: function (request, response) {
        var self = this;

        self.request = request;
        self.response = response;

        self.body = null;
        try {
            // support for POST request
            var requestBody = request.body;
            if (requestBody && requestBody.hasNext()) {
                var body = requestBody.nextEntry();
                if (body) {
                    self.body = body;
                }
            }
        } catch (ignore) {}
    },

    /**
     * Get param from URL path
     * 
     * @param {any} paramName
     * @param {any} defaultValue
     * @returns {undefined}
     */
    getPathParam: function (paramName, defaultValue) {
        var self = this;

        return (paramName in self.request.pathParams) ? self.request.pathParams[paramName] : defaultValue;
    },

    /**
     * Get param form URL query argument
     * 
     * @param {any} paramName
     * @param {any} defaultValue
     * @returns {undefined}
     */
    getQueryParam: function (paramName, defaultValue) {
        var self = this;

        var out = (paramName in self.request.queryParams) ? (function () {
            var value = self.request.queryParams[paramName];
            if (Array.isArray(value)) {
                return (value.length === 1) ? value[0] : value;
            } else {
                return value;
            }
        })() : defaultValue;

        if (out === undefined)
            return out;

        if (!isNaN(out))
            return parseInt(out, 10);
        if ('null' == out.toLowerCase())
            return null;

        return out;
    },


    /**
     * Source API. <br>This is the entry point to trigger a deployment on a target env.
     * takes updateSetSysId and targetEnvironment from payload body. <p>
     *  It: 
     *  <ul>
     *  <li>creates a local admin user with a random password</li>
     *  <li>sends a pull request for the update-set to the target containing
     *  <ul><li>User Credentials (encrypted)</li><li>Update Set ID</li><li>Source environment</li>
     *  </li>
     *  <li>waits for the target instance to pull and check the update-set</li>
     *  <li>returns the update-set status on the target env</li>
     *  </ul>
     * </p>
     *
     * This is mapped to POST: /api/swre/v1/cicd/deploy
     * 
     * @returns {undefined}
     */
    deployUpdateSet: function () {
        var self = this;
        var userSysId,
            roleSysId, updateSetSysId, sourceEnvironment, targetEnvironment;

        try {

            if (!self.body) {
                gs.error('no request payload found');
                throw Error('no request payload found');
            }
            if (gs.nil(self.body.updateSetSysId) || gs.nil(self.body.targetEnvironment)) {
                throw Error('updateSetSysId and targetEnvironment are mandatory');
            }

            updateSetSysId = self.body.updateSetSysId; // request.updateSetId
            sourceEnvironment = gs.getProperty('glide.servlet.uri').toLowerCase(); // the current instance
            targetEnvironment = self.body.targetEnvironment.toLowerCase(); // request.targetEnvironment

            if (targetEnvironment == sourceEnvironment) {
                throw Error('source and target can not be same');
            }

            var us = new GlideRecord('sys_update_set');
            if (us.get(updateSetSysId)) {
                if (us.getValue('state') != 'complete') {
                    throw Error('UpdateSet is Not in complete state');
                }
            }

            // create user on source instance
            var user = new GlideRecord('sys_user'),
                userName = '_CICD_DEPLOYMENT_'.concat(new GlideChecksum(targetEnvironment).getMD5()).substr(0, 40),
                userPassword = null;

            if (user.get('user_name', userName)) {
                userSysId = user.getValue('sys_id');

            } else {
                // create a random password
                userPassword = GlideSecureRandomUtil.getSecureRandomString(100);

                user.initialize();
                user.setValue('user_name', userName);
                user.setDisplayValue('user_password', userPassword);
                userSysId = user.insert();

                // assign admin role
                var roleAssignment = new GlideRecord('sys_user_has_role');
                roleAssignment.initialize();
                roleAssignment.setValue('user', userSysId);
                roleAssignment.setValue('role', '2831a114c611228501d4ea6c309d626d'); // TODO: admin sys_id
                roleAssignment.setValue('state', 'active');
                roleSysId = roleAssignment.insert();
            }

            // call target instance to load the update set
            var endpoint = targetEnvironment.concat('/api/swre/v1/cicd/pull'), // pullUpdateSet()
                requestBody = {
                    updateSetSysId: updateSetSysId,
                    sourceEnvironment: sourceEnvironment,
                    credentials: {
                        user: userName,
                        password: (userPassword) ? new GlideEncrypter().encrypt(userPassword) : null
                    }
                };

            var request = new sn_ws.RESTMessageV2();
            request.setEndpoint(endpoint);
            request.setRequestHeader('Authorization', 'Bearer '.concat(self.getBearer()));
            request.setRequestHeader("Accept", "application/json");
            request.setRequestHeader("Content-Type", "application/json");
            request.setHttpMethod('POST');

            request.setRequestBody(JSON.stringify(requestBody));

            //gs.info("POST body: {0}", requestBody);

            var response = request.execute();
            if (!response.haveError()) {
                /* redirect to the target environment to execute 
                    - loadUpdateSet
                    - previewUpdateSet
                    - commitUpdateSet
                    - deploymentComplete
                */
                var responseBody = JSON.parse(response.getBody());
                return self._sendLocation(303, responseBody.result, targetEnvironment); // see other
            } else {
                var statusCode = response.getStatusCode();
                if (statusCode == 666) {
                    /* Something went wrong with the creation of 'sys_update_set_source', remove user from source.*/
                    self.teardownSource(roleSysId, userSysId);
                }
                throw Error(endpoint.concat(' Request ended in error. Code: ', statusCode, ', Message: ', response.getErrorMessage()));
            }


        } catch (e) {
            self.teardownSource(roleSysId, userSysId);
            gs.error(e.message);
            return new sn_ws_err.BadRequestError(e.message);

        }

    },


    /**
     * Remove Update Set Source on target
     * 
     * @param {any} sourceSysId
     * @returns {undefined}
     */
    teardownTarget: function (sourceSysId) {
        var source = new GlideRecord('sys_update_set_source');
        if (!gs.nil(sourceSysId) && source.get(sourceSysId)) {
            source.deleteRecord();
        }
    },





    /**
     * This is mapped to GET: /api/swre/v1/cicd/deploy
     */
    processUpdateSetDeploySteps: function () {
        var self = this;

        try {
            var payload = Object.keys(self.request.queryParams).reduce(function (prev, key) {
                prev[key] = self.getQueryParam(key);
                return prev;
            }, {});
            var progressId = payload.progressId;

            if (!Object.keys(payload))
                throw Error('no request payload found');

            if (payload.targetEnvironment == gs.getProperty('glide.servlet.uri').toLowerCase()) {


                if (!gs.nil(progressId)) {
                    var pgr = new GlideRecord('sys_execution_tracker');
                    if (!pgr.get(progressId)) {
                        throw Error('no tracker found with that ID: '.concat(progressId));
                    } else {
                        var state = parseInt(pgr.getValue('state'), 10);
                        if (state == 4) { // Cancelled
                            throw Error('Execution Tracker cancelled: '.concat(pgr.getLink()));

                        } else if (state != 2) {
                            /*
                            job still in progress, return not modified 304 and url to this resource.
                            */
                            return self._sendLocation(304, payload);
                        }
                    }
                }

                // here state must be 2 (successful) or no tracker in place
                switch (payload.step) {
                    case 'loadUpdateSet':
                        return self._targetLoadUpdateSet(payload);

                    case 'previewUpdateSet':
                        return self._targetPreviewUpdateSet(payload);

                    case 'commitUpdateSet':
                        return self._targetCommitUpdateSet(payload);

                    case 'deploymentComplete':
                        return self._targetDeploymentComplete(payload);

                    default:
                        throw Error('Unknown Step: '.concat(payload.step));

                }

            } else {
                throw Error('TargetEnvironment not correct');
            }

        } catch (e) {
            gs.error(e.message);
            return new sn_ws_err.BadRequestError(e.message);
        }
    },


    _targetLoadUpdateSet: function (payload) {
        var self = this;

        var sourceSysId = payload.sourceSysId,
            updateSetSysId = payload.updateSetSysId;
        /*
            if this update set was already loaded, delete it.
        */
        var rus = new GlideRecord('sys_remote_update_set');
        if (rus.get('remote_sys_id', updateSetSysId)) {
            gs.info("deleting already loaded update set {0}", updateSetSysId);

            var lus = new GlideRecord('sys_update_set');
            lus.addQuery('sys_id', rus.getValue('update_set'));
            /*
                only delete if it was not changed (opened) on the target system since last deployment
            */
            lus.addQuery('sys_mod_count', 2);
            lus._query();
            if (lus._next()) {
                lus.deleteRecord();
            }

            // delete the remote update set
            rus.deleteRecord();
        }
        
        /*
            run worker to load the update set from remote
        */
        var worker = new GlideUpdateSetWorker();
        worker.setUpdateSourceSysId(sourceSysId); // the sys_update_set_source sys_id
        worker.setLimitSet(updateSetSysId); // the update-set sys_id 
        worker.setBackground(true);
        worker.start();
        var progress_id = worker.getProgressID();


        gs.info("GlideUpdateSetWorker completed progress_id: {0}", progress_id);

        self.assign(payload, {
            progressId: progress_id,
            step: 'previewUpdateSet'
        });

        // job create, return 'accepted'
        return self._sendLocation(202, payload);
    },

    _targetPreviewUpdateSet: function (payload) {
        var self = this;

        var updateSetSysId = payload.updateSetSysId;

        /*
            in case the sys property 'glide.update_set.auto_preview' is not enabled, 
            manually run the preview.
        */
        var rus = new GlideRecord('sys_remote_update_set');
        rus.addQuery('remote_sys_id', updateSetSysId);
        //rus.addQuery('state', '!=', 'previewed');
        rus._query();
        if (rus._next()) {
            var remoteUpdateSetSysId = rus.getValue('sys_id');

            if ('previewed' == rus.getValue('state')) {

                self.assign(payload, {
                    progressId: null,
                    state: rus.getValue('state'),
                    remoteUpdateSetSysId: remoteUpdateSetSysId,
                    step: 'commitUpdateSet'
                });

                // redirect to next step
                return self._sendLocation(303, payload); // see other
            }

            /*
                run the preview 
                code from /sys_script_include.do ? sys_id = 02 ba7cd747103200a03a19fbac9a71bc
            */
            var progress_id = (function () { 
                if (rus.remote_base_update_set.nil()) {
                    gs.info("Starting update set preview for: " + rus.name);
                    return new UpdateSetPreviewAjax().previewRemoteUpdateSetAgain(rus);
                } else {

                    //This is part of a batch, and it should run the batch previewer
                    var updateSet = new GlideRecord("sys_remote_update_set");
                    updateSet.get(rus.remote_base_update_set);
                    if (!updateSet.isValidRecord())
                        throw Error('Base UpdateSet not found for '.concat(rus.getLink(true)));

                    //Cancel any running trackers on the batch
                    var tracker = new GlideRecord('sys_execution_tracker');
                    tracker.addQuery("source", updateSet.sys_id);
                    tracker.addQuery("source_table", "sys_remote_update_set");
                    tracker.addQuery("state", "IN", "pending,running");
                    tracker.orderByDesc("sys_created_on");
                    tracker.query();
                    while (tracker.next()) {
                        gs.info("Tracker found and cancelling: " + updateSet.sys_id);
                        var previewer = new UpdateSetPreviewAjax();
                        previewer.sendCancelSignal(tracker.sys_id);
                    }
                    // END Cancel any running trackers on the batch

                    gs.info("Starting update set batch preview for: " + updateSet.name);

                    return new HierarchyUpdateSetPreviewAjax().previewRemoteHierarchyUpdateSetAgain(updateSet);
                }
            })();
            
            
            /*
            // this is the same as below but called via 'UpdateSetPreviewAjax'
            // sys_script_include.do?sys_id=22dc9002c3132100a77f4ddcddba8fd0
            var previewer = new UpdateSetPreviewAjax();
            var progress_id = previewer.previewRemoteUpdateSet(rus);
            */
            /*
            rus.state = "previewing";
            rus.update();

            // Add the retrieved updates to the Preview list
            // Setup and start the progress worker
            var w = new GlideScriptedHierarchicalWorker();
            w.setProgressName("Generating Update Set Preview for: " + rus.name);
            w.setScriptIncludeName("UpdateSetPreviewer");
            w.setScriptIncludeMethod("generatePreviewRecordsWithUpdate"); // or to run again 'generatePreviewRecordsAgain'
            w.putMethodArg("sys_id", rus.sys_id);
            w.setSource(rus.sys_id);
            w.setSourceTable("sys_remote_update_set");
            w.setBackground(true);
            w.setCannotCancel(true);
            w.start();

            var progress_id = w.getProgressID();
            */
            
            gs.info("UpdateSetPreviewer completed progress_id: {0}", progress_id);

            self.assign(payload, {
                state: state,
                progressId: progress_id,
                remoteUpdateSetSysId: remoteUpdateSetSysId,
                step: 'commitUpdateSet'
            });

            // job create, return 'accepted'
            return self._sendLocation(202, payload);
        }

        return false;
    },


    _targetCommitUpdateSet: function name(payload) {
        var self = this;
        try {
            try {

                /*
                    problem check could also be done with:
                    GlidePreviewProblemHandler.hasUnresolvedProblems('sys_remote_update_set_SYS_ID')

                */
                var problem = new GlideRecord('sys_update_preview_problem');
                problem.addQuery('remote_update_set='.concat(payload.remoteUpdateSetSysId, '^type=error^status='));
                problem._query();
                var issues = [];
                while (problem._next()) {
                    issues.push({
                        type: problem.getValue('type'),
                        name: problem.getValue('description'),
                        link: gs.getProperty('glide.servlet.uri').concat(problem.getLink(true))
                    });
                }
                if (issues.length) {
                    throw {
                        code: 409,
                        error: {
                            name: 'Update Set Preview Problems',
                            message: 'Update collisions must be manually solved.',
                            updateSet: gs.getProperty('glide.servlet.uri').concat(problem.getElement('remote_update_set').getRefRecord().getLink(true)),
                            warnings: issues
                        },
                        status: 'failure'
                    };
                }

                var query = 'remote_update_set='.concat(payload.remoteUpdateSetSysId, '^action=DELETE^nameDOES NOT CONTAINsys_dictionary_override^nameSTARTSWITHsys_dictionary^ORnameSTARTSWITHsys_db_object^ORnameSTARTSWITHvar_dictionary^ORnameSTARTSWITHsvc_extension_variable^ORnameSTARTSWITHwf_activity_variable^ORnameSTARTSWITHatf_input_variable^ORnameSTARTSWITHatf_output_variable^ORnameSTARTSWITHsys_atf_variable^ORnameSTARTSWITHsys_atf_remembered_values^ORDERBYtype^ORDERBYname');
                var gr = new GlideRecord('sys_update_xml');
                gr.addQuery(query);
                gr._query();
                while (gr._next()) {
                    issues.push({
                        type: gr.getValue('type'),
                        name: gr.getValue('name')
                    });
                }
                if (issues.length) {
                    throw {
                        code: 409,
                        error: {
                            name: 'Data Loss Warning',
                            message: 'If you commit this update set, the system will automatically delete all data stored in the tables and columns that are defined in these Customer Updates',
                            updateSet: gs.getProperty('glide.servlet.uri').concat(problem.getElement('remote_update_set').getRefRecord().getLink(true)),
                            warnings: issues
                        },
                        status: 'failure'
                    }
                }
            } catch (error) {
                self.response.setStatus(error.code);
                return self.response.setBody(error); //self.response.setError()
            }

            /*
                Commit the update set.
                code from /sys_script_include.do ? sys_id = d14a6c27eff22000c6845a3615c0fb5d
            */
            /*
            var commitResult = new UpdateSetCommitAjax((function () {
                var params = {
                    sysparm_type: 'commitRemoteUpdateSet',
                    sysparm_remote_updateset_sys_id: payload.remoteUpdateSetSysId
                };
                return {
                    getParameter: function (paramName) {
                        return params[paramName];
                    }
                };
            })(), new GlideXMLDocument(), '').process();
            var progress_id = commitResult.split(',')[0];
            */
            
            
            var worker = new SNC.HierarchyUpdateSetScriptable();
            var progress_id = worker.commitHierarchy(payload.remoteUpdateSetSysId);
            

            self.assign(payload, {
                state: 'committing',
                progressId: progress_id,
                step: 'deploymentComplete'
            });

            return self._sendLocation(202, payload); // job create, return 'accepted'
            /*
            self.response.setStatus(202);
            self.response.setHeader("Location",
                '/api/swre/v1/cicd/queue?trackerId='.concat(trackerId, '&payload=', encodeURIComponent(JSON.stringify(payload)))
            );
            */
        } catch (e) {
            gs.error(e.message);
            return new sn_ws_err.BadRequestError(e.message);

        }
    },

    _targetDeploymentComplete: function name(payload) {
        var self = this;

        var us = new GlideRecord('sys_update_set');
        if (us.get('remote_sys_id', payload.remoteUpdateSetSysId)) {
            payload.targetUpdateSetSysId = us.getValue('sys_id');
            payload.state = 'committed';
        }
        return payload;
    },


    _sendLocation: function (status, payload, host) {
        var self = this;
        var queryParams = Object.keys(payload).map(function (key) {
            return key.concat('=', encodeURIComponent(payload[key]));
        });

        self.response.setStatus(status);
        self.response.setHeader("Location",
            (host || gs.getProperty('glide.servlet.uri').toLowerCase()).concat('/api/swre/v1/cicd/deploy?', queryParams.join('&'))
        );
        return;
    },

    /**
     * Target API. This API is called from the source env see {@link global.module:sys_script_include.CiCdDeploy#deployUpdateSet}.<br>
     * If required, it creates and configures a local update-set-source, pulls the Update-Set from the source env and returns preview status.<br>
     * 
     * This is mapped to POST: /api/swre/v1/cicd/pull
     * @returns {undefined}
     */
    pullUpdateSet: function () {
        var self = this,
            sourceSysId, sourceEnvironment, updateSetSysId;

        try {
            if (!self.body) {
                gs.error('no request payload found');
                throw Error('no request payload found');
            }
            if (gs.nil(self.body.updateSetSysId) || gs.nil(self.body.sourceEnvironment)) {
                throw Error('updateSetSysId, sourceEnvironment are mandatory');
            }

            updateSetSysId = self.body.updateSetSysId;

            /*
                create a dynamic source definition
            */
            try {

                sourceEnvironment = self.body.sourceEnvironment.toLowerCase();

                var source = new GlideRecord('sys_update_set_source'),
                    name = new GlideChecksum(sourceEnvironment).getMD5().substr(0, 40),
                    desc = 'CICD deployment source for '.concat(sourceEnvironment, '. DO NOT DELETE OR CHANGE!');

                if (source.get('url', sourceEnvironment)) {
                    sourceSysId = source.getValue('sys_id');
                } else {
                    var credentials = self.body.credentials || {};

                    if (!credentials.password)
                        throw Error('credentials.password is mandatory');

                    if (!credentials.user)
                        throw Error('credentials.user is mandatory');

                    source.initialize();

                    source.setValue('url', sourceEnvironment);
                    source.setValue('username', credentials.user);
                    source.setValue('password', new GlideEncrypter().decrypt(credentials.password));
                    source.setValue('name', name);
                    source.setValue('short_description', desc);
                    source.setValue('type', 'dev');
                    source.setValue('active', true);
                    sourceSysId = source.insert();
                }
                if (gs.nil(sourceSysId))
                    throw Error('Somethings wrong with the creation of sys_update_set_source');

                gs.info("sys_update_set_source {0}", sourceSysId);

            } catch (e) {
                // remove the record completely 
                self.teardownTarget(sourceSysId);

                // tell request to also remove the user
                var error = new sn_ws_err.ServiceError();
                error.setStatus(666);
                error.setMessage('Source Creation Failed');
                error.setDetail(e.message);
                return error;
            }

            var payload = {
                sourceEnvironment: sourceEnvironment,
                targetEnvironment: gs.getProperty('glide.servlet.uri').toLowerCase(),
                sourceSysId: sourceSysId,
                updateSetSysId: updateSetSysId,
                step: 'loadUpdateSet'
            };

            return payload;

        } catch (e) {
            gs.error(e.message);
            return new sn_ws_err.BadRequestError(e.message);
        }

    },


    /**
     * Remove user and role on source environment
     * 
     * @param {any} roleSysId
     * @param {any} userSysId
     * @returns {undefined}
     */
    teardownSource: function (roleSysId, userSysId) {

        var role = new GlideRecord('sys_user_has_role');
        if (!gs.nil(roleSysId) && role.get(roleSysId)) {
            role.deleteRecord();
        }
        var user = new GlideRecord('sys_user');
        if (!gs.nil(userSysId) && user.get(userSysId)) {
            user.deleteRecord();
        }
    },

    /**
     * Get Oauth bearer from DB
     * 
     * @returns {any} token
     */
    getBearer: function () {
        var self = this,
            token = 'undefined';

        var gr = new GlideRecord('oauth_credential');
        if (gr.get(self.REST_BEARER)) {
            token = gr.getValue('token');
        }
        return token;
    },



    type: 'CiCdDeploy'
};