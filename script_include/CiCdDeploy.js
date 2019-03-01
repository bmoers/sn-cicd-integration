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
        } catch (ignore) { }
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

    getBaseURI: function () {
        var self = this;
        // get base uri out of '/api/devops/v101/cicd/pull' or '/api/devops/cicd/pull'
        var tmp = self.request.uri.split('/');
        return tmp.slice(0, (/^v\d+$/m.test(tmp[3]) ? 5 : 4)).join('/')
    },

    /**
     * Source API. <br>This is the entry point to trigger a deployment on a target env.
     * takes updateSetSysId and targetEnvironment from payload body. <p>
     *  It: 
     *  <ul>
     *  <li>can create a local admin user with a random password</li>
     *  <li>sends a pull request for the update-set to the target containing
     *  <ul><li>User Credentials (encrypted)</li><li>Update Set ID</li><li>Source environment</li>
     *  </li>
     *  <li>waits for the target instance to pull and check the update-set</li>
     *  <li>returns the update-set status on the target env</li>
     *  </ul>
     * </p>
     *
     * This is mapped to POST: /api/devops/v1/cicd/deploy
     * 
     * @returns {undefined}
     */
    deployUpdateSet: function () {
        var self = this;
        var userSysId,
            roleSysId, updateSetSysId, commitId, sourceEnvironment, targetEnvironment, limitSet = [],
            sourceUserName, sourcePassword,
            targetUserName, targetPassword,
            autoCreateCdUser,
            gitDeployment, sourceUrl, deploy;

        try {

            /*
                {
                    "updateSetSysId": "xxxxxxxxxxxxxxxxxxxxxxxx",
                    "targetEnvironment": {
                        "host": "https://targethost.service-now.com",
                        "username": "",
                        "password": ""
                    },
                    "sourceEnvironment": {
                        "username": "",
                        "password": ""
                    }
                }
            */

            /*
            if (!gs.getUser().getRoles().contains('admin'))
                throw Error('CD User must have admin grants.');
            */

            if (!self.body) {
                gs.error('no request payload found');
                throw Error('deployUpdateSet: no request payload found');
            }
            if (gs.nil(self.body.commitId || self.body.updateSetSysId) || gs.nil(self.body.targetEnvironment) || gs.nil(self.body.targetEnvironment.host)) {
                throw Error('updateSetSysId/commitId and targetEnvironment are mandatory');
            }

            commitId = self.body.commitId;
            updateSetSysId = self.body.updateSetSysId; // request.updateSetId
            sourceEnvironment = gs.getProperty('glide.servlet.uri').toLowerCase(); // the current instance
            gitDeployment = !gs.nil(self.body.commitId);
            deploy = self.body.deploy;
            sourceUrl = gitDeployment ? sourceEnvironment.concat(sourceEnvironment.endsWith('/') ? '' : '/', 'api/devops/cicd/source/') : sourceEnvironment;

            targetEnvironment = self.body.targetEnvironment.host.toLowerCase();
            targetUserName = self.body.targetEnvironment.username;
            targetPassword = self.body.targetEnvironment.password;

            if (self.body.sourceEnvironment) {
                sourceUserName = self.body.sourceEnvironment.username;
                sourcePassword = self.body.sourceEnvironment.password;
            }

            autoCreateCdUser = ('true' == gs.getProperty('cicd-integration.auto-create-cd-user', 'false'));

            var targetMatch = targetEnvironment.match(/(?:http[s]?:\/\/)([^\.]*)([^:\/]*)/i);
            if (!targetMatch || targetMatch[2] !== '.service-now.com') // protect from sending credentials with high privileges to a non service-now.com host
                throw Error('invalid host');

            var sourceMatch = sourceEnvironment.match(/(?:http[s]?:\/\/)([^\.]*)([^:\/]*)/i);
            if (!sourceMatch || !targetMatch[1])
                throw Error('invalid host');

            if (sourceMatch[1] == targetMatch[1])
                throw Error('source and target can not be same');


            if (gitDeployment) { // git 2 snow deployment
                updateSetSysId = commitId;
                limitSet.push(commitId);

            } else { // for snow 2 snow deployment, check us state etc
                var us = new GlideRecord('sys_update_set');
                if (!us.get(updateSetSysId))
                    throw Error('UpdateSet not found');

                if (us.getValue('state') != 'complete') {
                    throw Error('UpdateSet is not in complete state');
                }

                if (us.base_update_set.nil()) {
                    limitSet.push(updateSetSysId);
                } else {
                    var baseSysId = us.getValue('base_update_set');
                    if (updateSetSysId != baseSysId)
                        throw Error('This update-set is member of a batch. Parent must be deployed: ' + baseSysId);

                    var bus = new GlideRecord('sys_update_set');
                    bus.addQuery('base_update_set', updateSetSysId);
                    bus._query();
                    while (bus._next()) {
                        limitSet.push(bus.getValue('sys_id'));
                    }
                }
            }


            if (!autoCreateCdUser) {
                /*
                // use user from request
                var auth = self.request.getHeader('authorization') || '';
                var authOpt = auth.split(/\s/);
                if (authOpt[0] && 'basic' == authOpt[0].toLowerCase()) {
                    var credentials = ''.concat(new GlideStringUtil().base64Decode(authOpt[1])).split(/:(.+)/);
                    sourceUserName = credentials[0];
                    sourcePassword = credentials[1];
                }
                */

                if (!sourceUserName || !sourcePassword)
                    throw Error('source credentials not specified');

                // check if use has right roles
                var adminRoles = [];
                var adminRole = new GlideRecord('sys_user_role');
                adminRole.addQuery('name', 'IN', ['admin', 'teamdev_user']);
                adminRole._query();
                while (adminRole._next()) {
                    adminRoles.push(adminRole.getValue('sys_id'));
                }

                var user = new GlideRecord('sys_user');
                if (!user.get('user_name', sourceUserName))
                    throw Error('source user not specified'); // same error as above to not expose user existence

                var roleAssignment = new GlideRecord('sys_user_has_role');
                roleAssignment.addQuery('user', user.getValue('sys_id'));
                roleAssignment.addQuery('role', 'IN', adminRoles);
                roleAssignment.addQuery('state', 'active');
                roleAssignment._query();
                if (!roleAssignment._next())
                    throw Error('source user has not the appropriate role');

            } else {

                // create user on source instance
                var userUniqueId = sourceUrl.concat(' to ', targetEnvironment);
                var user = new GlideRecord('sys_user');
                sourceUserName = '_CICD_DEPLOYMENT_'.concat(new GlideChecksum(userUniqueId).getMD5()).substr(0, 40);
                sourcePassword = null;

                if (user.get('user_name', sourceUserName)) {
                    userSysId = user.getValue('sys_id');
                    if (user.getValue('last_name') !== userUniqueId) {
                        user.setValue('first_name', 'CD-User for');
                        user.setValue('last_name', userUniqueId);
                        user.update();
                    }
                } else {
                    // create a random password
                    sourcePassword = GlideSecureRandomUtil.getSecureRandomString(100);

                    user.initialize();
                    user.setValue('user_name', sourceUserName);
                    user.setDisplayValue('user_password', sourcePassword);
                    user.setValue('first_name', 'CD-User for');
                    user.setValue('last_name', userUniqueId);
                    userSysId = user.insert();
                    if (!userSysId)
                        throw Error('CICdDeploy: User not created. sys_update_set_source on \'' + targetEnvironment + '\' for host \'' + sourceEnvironment + '\' needs to be created manually');

                    // assign teamdev_user or admin role (whatever exists first)
                    var adminRole = new GlideRecord('sys_user_role');
                    if (adminRole.get('name', 'teamdev_user') || adminRole.get('name', 'admin')) {
                        var roleAssignment = new GlideRecord('sys_user_has_role');
                        roleAssignment.initialize();
                        roleAssignment.setValue('user', userSysId);
                        roleAssignment.setValue('role', adminRole.getValue('sys_id'));
                        roleAssignment.setValue('state', 'active');
                        roleSysId = roleAssignment.insert();
                    } else {
                        throw Error('CICdDeploy: admin role not found. ' + sourceUserName + ' will not have the correct grants to have this working');
                    };
                }
            }

            // call target instance to load the update set
            var endpoint = targetEnvironment.concat(targetEnvironment.endsWith('/') ? '' : '/', 'api/devops/cicd/pull'), // pullUpdateSet()
                requestBody = {
                    updateSetSysId: updateSetSysId,
                    limitSet: limitSet.join(','), // <-- this are actually the US to be deployed
                    sourceEnvironment: sourceEnvironment,
                    gitDeployment: gitDeployment,
                    deploy: deploy,
                    sourceUrl: sourceUrl,
                    credentials: {
                        user: sourceUserName,
                        password: (sourcePassword) ? new GlideEncrypter().encrypt(sourcePassword) : null
                    }
                };

            var request = new sn_ws.RESTMessageV2();
            request.setEndpoint(endpoint);

            if (targetUserName && targetPassword) {
                request.setBasicAuth(targetUserName, targetPassword);
            } else {
                throw Error('No credentials specified for ' + endpoint);
            }

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
                throw Error(endpoint.concat(' Request ended in error. Code: ', statusCode, ', Message: ', response.getErrorMessage(), response.getBody()));
            }


        } catch (e) {
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
     * This is mapped to GET: /api/devops/v1/cicd/deploy
     */
    processUpdateSetDeploySteps: function () {
        var self = this;

        try {
            var payload = Object.keys(self.request.queryParams).reduce(function (prev, key) {
                prev[key] = self.getQueryParam(key);
                return prev;
            }, {});

            //var payload = JSON.parse(decodeURIComponent(self.getQueryParam('p')));

            if (!Object.keys(payload))
                throw Error('processUpdateSetDeploySteps: no request payload found');

            var progressId = payload.progressId;

            if (payload.targetEnvironment == gs.getProperty('glide.servlet.uri').toLowerCase()) {

                if (!gs.nil(progressId)) {
                    var pgr = new GlideRecord('sys_execution_tracker');
                    if (!pgr.get(progressId)) {
                        throw Error('no tracker found with that ID: '.concat(progressId));
                    } else {
                        var state = parseInt(pgr.getValue('state'), 10);
                        if (state == 4) // Cancelled
                            throw Error('Execution Tracker cancelled: '.concat(pgr.getLink()));

                        if (parseInt(pgr.getValue('percent_complete'), 10) != 100) {
                            /*
                            job still in progress, return not modified 304 and url to this resource.
                            */
                            return self._sendLocation(304, payload);
                        }
                    }
                }

                // here 'percent_complete' must be 100 (%) or no tracker in place
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
            limitSet = (payload.limitSet || '').split(',');

        /*
            if this update set was already loaded, delete it.
        */
        limitSet.forEach(function (updateSetSysId) {
            var rus = new GlideRecord('sys_remote_update_set');
            rus.addQuery('remote_sys_id', updateSetSysId);
            rus._query();
            while (rus._next()) {

                var lus = new GlideRecord('sys_update_set');
                lus.addQuery('sys_id', rus.getValue('update_set'));
                /*
                    only delete if it was not changed (opened) on the target system since last deployment
                */
                lus.addQuery('sys_mod_count', '<=', 2);
                lus.addQuery('state', 'complete');
                lus._query();
                if (lus._next()) {
                    gs.info("[CICD] : deleting local update-set '{0}'", lus.getValue('sys_id'));
                    lus.deleteRecord();
                } else {
                    gs.info("[CICD] : local update-set '{0}' was modified since deployment and will not be deleted.", lus.getValue('sys_id'));
                }

                gs.info("[CICD] : deleting already loaded update-set '{0}'", updateSetSysId);
                // delete the remote update set
                rus.deleteRecord();
            }
        });


        /*
            run worker to load the update set from remote
        */
        var worker = new GlideUpdateSetWorker();
        worker.setUpdateSourceSysId(sourceSysId); // the sys_update_set_source sys_id
        worker.setLimitSet(limitSet); // the update-set sys_id's
        worker.setBackground(true);
        worker.start();
        var progress_id = worker.getProgressID();

        //gs.info("GlideUpdateSetWorker progress_id: '{0}'", progress_id.toString());

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
                state: "previewing",
                progressId: progress_id,
                remoteUpdateSetSysId: remoteUpdateSetSysId,
                step: 'commitUpdateSet'
            });

            // job create, return 'accepted'
            return self._sendLocation(202, payload);
        }

        throw Error('Remote update-set not found with "remote_sys_id" ' + updateSetSysId);
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
                problem.addQuery('type=error^status=^'.concat('remote_update_set=', payload.remoteUpdateSetSysId, '^ORremote_update_set.remote_base_update_set=', payload.remoteUpdateSetSysId));
                problem._query();
                //gs.info("[CICD] : problem lookup query"+ problem.getEncodedQuery())
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

                var del = new GlideRecord('sys_update_xml');
                del.addQuery('action=DELETE^'.concat('remote_update_set=', payload.remoteUpdateSetSysId, '^ORremote_update_set.remote_base_update_set=', payload.remoteUpdateSetSysId, '^nameDOES NOT CONTAINsys_dictionary_override^nameSTARTSWITHsys_dictionary^ORnameSTARTSWITHsys_db_object^ORnameSTARTSWITHvar_dictionary^ORnameSTARTSWITHsvc_extension_variable^ORnameSTARTSWITHwf_activity_variable^ORnameSTARTSWITHatf_input_variable^ORnameSTARTSWITHatf_output_variable^ORnameSTARTSWITHsys_atf_variable^ORnameSTARTSWITHsys_atf_remembered_values^ORDERBYtype^ORDERBYname'));
                //gs.info("[CICD] : problem lookup query" + del.getEncodedQuery())
                del._query();
                while (del._next()) {
                    issues.push({
                        type: del.getValue('type'),
                        name: del.getValue('name')
                    });
                }
                if (issues.length) {
                    throw {
                        code: 409,
                        error: {
                            name: 'Data Loss Warning',
                            message: 'If you commit this update set, the system will automatically delete all data stored in the tables and columns that are defined in these Customer Updates',
                            updateSet: gs.getProperty('glide.servlet.uri').concat('sys_remote_update_set.do?sys_id=', payload.remoteUpdateSetSysId),
                            warnings: issues
                        },
                        status: 'failure'
                    }
                }
            } catch (error) {
                self.response.setStatus(error.code);
                return self.response.setBody(error); //self.response.setError()
            }

            // only commit if 'deploy' is set
            var progress_id = null;
            if (payload.deploy) {
                var rus = new GlideRecord('sys_remote_update_set');
                if (rus.get(payload.remoteUpdateSetSysId)) {
                    if (rus.remote_base_update_set.nil()) {
                        /*
                            Commit the update set.
                            code from /sys_ui_action.do?sys_id=c38b2cab0a0a0b5000470398d9e60c36 
                            calling /sys_script_include.do?sys_id=d14a6c27eff22000c6845a3615c0fb5d
                        */
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
                        progress_id = commitResult.split(',')[0];
                    } else {
                        /*
                            HierarchyUpdateSetCommitAjax
                            code from /sys_ui_action.do?sys_id=addc9e275bb01200abe48d5511f91a78
                            calling /sys_script_include.do?sys_id=fcfc9e275bb01200abe48d5511f91aea
                        */
                        var updateSet = new GlideRecord("sys_remote_update_set");
                        if (updateSet.get(rus.remote_base_update_set)) {
                            var worker = new SNC.HierarchyUpdateSetScriptable();
                            progress_id = worker.commitHierarchy(updateSet.sys_id);
                        } else {
                            throw Error("Batch-UpdateSet not found for update-set with id" + payload.remoteUpdateSetSysId);
                        }
                    }
                } else {
                    throw Error("UpdateSet not found with id" + payload.remoteUpdateSetSysId);
                }
            }

            self.assign(payload, {
                state: 'committing',
                progressId: progress_id,
                step: 'deploymentComplete'
            });

            return self._sendLocation(202, payload); // job create, return 'accepted'

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
            payload.state = (payload.deploy) ? 'committed' : 'delivered';
        }
        return payload;
    },


    _sendLocation: function (status, payload, host) {
        var self = this;

        var queryParams = Object.keys(payload).map(function (key) {
            return key.concat('=', encodeURIComponent(payload[key]));
        });

        var uri = (host || gs.getProperty('glide.servlet.uri')).toLowerCase();

        self.response.setStatus(status);
        self.response.setHeader("Location",
            uri.concat(uri.endsWith('/') ? '' : '/', 'api/devops/cicd/deploy?', queryParams.join('&'))
        );
        return;
    },

    /**
     * Target API. This API is called from the source env see {@link global.module:sys_script_include.CiCdDeploy#deployUpdateSet}.<br>
     * If required, it creates and configures a local update-set-source, pulls the Update-Set from the source env and returns preview status.<br>
     * 
     * This is mapped to POST: /api/devops/v1/cicd/pull
     * @returns {undefined}
     */
    pullUpdateSet: function () {
        var self = this,
            sourceSysId, sourceEnvironment, sourceUrl, updateSetSysId, limitSet, deploy;

        try {
            if (!self.body) {
                gs.error('no request payload found');
                throw Error('pullUpdateSet: no request payload found');
            }
            [self.body.updateSetSysId, self.body.sourceEnvironment, self.body.limitSet].forEach(function (param) {
                if (gs.nil(param))
                    throw Error('updateSetSysId, sourceEnvironment are mandatory');
            });

            if (!gs.getUser().getRoles().contains('admin'))
                throw Error('CD User must have admin grants.');
            /*
                create a dynamic source definition
            */
            try {

                sourceEnvironment = self.body.sourceEnvironment.toLowerCase();
                updateSetSysId = self.body.updateSetSysId;
                limitSet = self.body.limitSet;
                sourceUrl = (self.body.sourceUrl || sourceEnvironment).trim();
                gitDeployment = self.body.gitDeployment || false;
                deploy = self.body.deploy || false;

                var source = new GlideRecord('sys_update_set_source'),
                    name = new GlideChecksum(sourceUrl).getMD5().substr(0, 40),
                    desc = 'CICD deployment source for '.concat(sourceUrl, '. DO NOT DELETE OR CHANGE!');

                var noSlashUrl = sourceUrl.replace(/\/$/, "");
                if (source.get('url', noSlashUrl) || source.get('url', noSlashUrl + '/')) {
                    sourceSysId = source.getValue('sys_id');
                } else {
                    var credentials = self.body.credentials || {};

                    if (!credentials.password)
                        throw Error('credentials.password is mandatory');

                    if (!credentials.user)
                        throw Error('credentials.user is mandatory');

                    source.initialize();

                    source.setValue('url', sourceUrl);
                    source.setValue('username', credentials.user);
                    source.setValue('password', new GlideEncrypter().decrypt(credentials.password));
                    source.setValue('name', name);
                    source.setValue('short_description', desc);
                    source.setValue('type', (gitDeployment) ? 'GIT' : 'dev');
                    source.setValue('active', true);
                    source.setWorkflow(false);
                    sourceSysId = source.insert();
                }
                if (gs.nil(sourceSysId))
                    throw Error('Somethings wrong with the creation of sys_update_set_source. CD User must have admin grants.');

                gs.info("[CICD] : pullUpdateSet() sys_update_set_source {0}", sourceSysId);

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
                limitSet: limitSet,
                deploy: deploy,
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

    type: 'CiCdDeploy'
};