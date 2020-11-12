/* exported CiCdDeploy */

/**
 * CD API to request target instance to pull update set
 * 
 * @class 
 * @author Boris Moers
 * @requires sn_ws.module:sys_script_include.RESTMessageV2
 * @requires sn_ws_err.module:sys_script_include.BadRequestError
 * @requires global.module:sys_script_include.UpdateSetPreviewAjax
 * @requires global.module:sys_script_include.HierarchyUpdateSetPreviewAjax
 * @requires global.module:sys_script_include.UpdateSetCommitAjax
 * @requires global.module:sys_script_include.SNC#HierarchyUpdateSetScriptable
 * @requires sn_ws_err.module:sys_script_include.ServiceError
 * @memberof global.module:sys_script_include
 */
var CiCdDeploy = Class.create();

CiCdDeploy.prototype = /** @lends global.module:sys_script_include.CiCdDeploy.prototype */ {

    REQUIRES_REVIEW: 'conflict_review',//'Do Not Commit',

    /**
     * Polyfills for Object.assign
     * 
     * @param {any} target
     * @returns {any} to
     */
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
        } catch (ignore) {
            // ignore
        }

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
    },

    /**
     * Get param from URL path
     * 
     * @param {any} paramName
     * @param {any} defaultValue
     * @returns {ConditionalExpression}
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
     * @returns {any}
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
        var outL = out.toLowerCase();
        if (out === undefined)
            return out;

        if (!isNaN(out))
            return parseInt(out, 10);
        if ('null' == outL)
            return null;
        if ('true' == outL)
            return true;
        if ('false' == outL)
            return false;

        return out;
    },

    /**
     * Get base uri from current request uri
     * 
     * @returns {ConditionalExpression}
     */
    getBaseURI: function () {
        var self = this;
        // get base uri out of '/api/devops/v101/cicd/pull' or '/api/devops/cicd/pull'
        var tmp = self.request.uri.replace(/(\/+)/g, "/").split('/');
        tmp = tmp.slice(0, ((/^v\d+$/m).test(tmp[3]) ? 5 : 4)).join('/');
        return tmp.startsWith('/') ? tmp : '/'.concat(tmp);
    },


    _cloneUpdateSet: function (updateSetSysId) {
        var self = this;
        var cloneUpdateSet = function (sysId, parentSysId, batchBaseSysId) {
            var us = new GlideRecord('sys_update_set');
            if (us.get(sysId)) {
                self.console.info("cloning update set {0} with parent {1}", sysId, parentSysId);

                us.setValue('name', '[CICD PREFLIGHT] - '.concat(us.getValue('name')));
                us.setValue('description', 'This is the preflight copy of the update set \''.concat(sysId, '\' from \'', gs.getProperty('instance_name'), '\'.\nPlease do not deploy this update set.'));

                if (parentSysId)
                    us.setValue('parent', parentSysId)

                if (batchBaseSysId)
                    us.setValue('base_update_set', batchBaseSysId)

                var copySysId = us.insert();

                var isBatchBase = (sysId == us.getValue('base_update_set')); // the current update set is the base and must point to itself.
                if (isBatchBase) {
                    us.setValue('base_update_set', copySysId)
                    us.update();
                    batchBaseSysId = copySysId;
                }
                self.console("Cloned update set {0}", copySysId)

                // clone all XML records
                var usXml = new GlideRecord('sys_update_xml');
                usXml.addQuery('update_set', sysId);
                usXml.query();
                while (usXml._next()) {
                    usXml.setValue('update_set', copySysId);
                    usXml.insert();
                }

                // copy all dependent update sets
                var bus = new GlideRecord('sys_update_set');
                bus.addQuery('sys_id', '!=', sysId);
                bus.addQuery('parent', sysId);
                bus._query();
                while (bus._next()) {
                    cloneUpdateSet(bus.getValue('sys_id'), copySysId, batchBaseSysId);
                }
                return copySysId;
            }
        }

        return cloneUpdateSet(updateSetSysId);
    },

    _deleteClone: function (updateSetSysId) {
        var self = this;

        var deleteDependentUpdateSet = function (parentSysID) {
            var bus = new GlideRecord('sys_update_set');
            bus.addQuery('name', 'STARTSWITH', '[CICD PREFLIGHT]');
            bus.addQuery('parent', parentSysID);
            bus.query();
            while (bus._next()) {
                deleteDependentUpdateSet(bus.getValue('sys_id'));
                self.console.log("Deleting update set " + bus.getValue('sys_id'));
                bus.deleteRecord();
            }

        }

        var us = new GlideRecord('sys_update_set');
        us.addQuery('name', 'STARTSWITH', '[CICD PREFLIGHT]');
        us.addQuery('sys_id', updateSetSysId);
        us.setLimit(1);
        us.query();
        if (us._next()) {
            deleteDependentUpdateSet(us.getValue('sys_id'));
            self.console.log("Deleting update set " + us.getValue('sys_id'));
            return us.deleteRecord();
        }

        return false;
    },


    /**
     * Source API. <br>This is the entry point to trigger a deployment on a target env.
     * takes updateSetSysId and targetEnvironment from payload body. <p>
     * It:
     * <ul>
     * <li>can create a local admin user with a random password</li>
     * <li>sends a pull request for the update-set to the target containing
     * <ul><li>User Credentials (encrypted)</li><li>Update Set ID</li><li>Source environment</li>
     * </li>
     * <li>waits for the target instance to pull and check the update-set</li>
     * <li>returns the update-set status on the target env</li>
     * </ul>
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
            gitDeployment, sourceUrl, collisionDetect;

        /*
            {
                "updateSetSysId": "xxxxxxxxxxxxxxxxxxxxxxxx",
                "commitId": "xxxxxxxxxxxxxxxxxxxxxxx",
                "deploy" : true/false
                "collisionDetect" : true/false
                "targetEnvironment": {
                    "host": "https://targethost.service-now.com",
                    "username": "",
                    "password": ""
                },
                "sourceEnvironment": {
                    "username": "",
                    "password": ""
                },
                "conflicts": {
                    "resolutions": {},
                    "defaults" : {}
                }
            }
        */

        try {

            if (GlidePluginManager.isUpgradeSystemBusy()) {
                self.console.error('[pullUpdateSet] Environment is upgrading');
                throw Error('pullUpdateSet: Environment is upgrading');
            }

            if (!self.body) {
                self.console.error('no request payload found');
                throw Error('deployUpdateSet: no request payload found');
            }
            if (gs.nil(self.body.commitId || self.body.updateSetSysId) || gs.nil(self.body.targetEnvironment) || gs.nil(self.body.targetEnvironment.host)) {
                throw Error('updateSetSysId/commitId and targetEnvironment are mandatory');
            }

            collisionDetect = Boolean(self.body.collisionDetect);
            commitId = gs.nil(self.body.commitId) ? null : self.body.commitId;
            updateSetSysId = self.body.updateSetSysId; // request.updateSetId
            sourceEnvironment = gs.getProperty('glide.servlet.uri').toLowerCase().replace(/\/$/, ""); // the current instance
            gitDeployment = (!collisionDetect && !gs.nil(commitId)); // collisionDetect can not be done via gitDeployment

            sourceUrl = gitDeployment ? sourceEnvironment.concat(self.getBaseURI(), '/source/') : sourceEnvironment;

            targetEnvironment = self.body.targetEnvironment.host.toLowerCase().replace(/\/$/, "");
            targetUserName = self.body.targetEnvironment.username;
            targetPassword = self.body.targetEnvironment.password;

            if (self.body.sourceEnvironment) {
                sourceUserName = self.body.sourceEnvironment.username;
                sourcePassword = self.body.sourceEnvironment.password;
            }

            autoCreateCdUser = ('true' == gs.getProperty('cicd-integration.auto-create-cd-user', 'false'));

            var targetMatch = targetEnvironment.match(/(?:http[s]?:\/\/)([^\.]*)([^:\/]*)/i);
            if (!targetMatch || !targetMatch[1] || !targetMatch[2]) 
                throw Error('invalid target host');

            var sourceMatch = sourceEnvironment.match(/(?:http[s]?:\/\/)([^\.]*)([^:\/]*)/i);
            if (!sourceMatch || !sourceMatch[1] || !sourceMatch[2])
                throw Error('invalid source host');

            if (sourceMatch[1] == targetMatch[1])
                throw Error('source and target can not be same');

            // protect from sending credentials with high privileges to a non service-now.com host
            if (sourceMatch[2] != targetMatch[2]){
                throw Error('invalid hosts');
            }

            // updateSetSysId = the sys_id of the source update set
            // commitId = the id to load the update set

            if (gitDeployment) { // git 2 snow deployment
                if (!updateSetSysId) { // if no updateSetId provided, derive from the commit id
                    updateSetSysId = commitId.substr(0, 32); // make the commit ID as long as a sys_id
                }
                limitSet.push(commitId);

            } else { // for snow 2 snow deployment, check us state etc
                var us = new GlideRecord('sys_update_set');
                if (!us.get(updateSetSysId))
                    throw Error('UpdateSet not found');

                if (us.getValue('state') != 'complete') {
                    throw Error('UpdateSet is not in complete state');
                }

                /*
                if (collisionDetect) {
                    // clone the update set on the source env for preview
                    updateSetSysId = self._cloneUpdateSet(updateSetSysId);
                    us = new GlideRecord('sys_update_set');
                    if (!us.get(updateSetSysId))
                        throw Error('UpdateSet not found');
                }
                */
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

            // in GIT deployment mode, the user does not require to have the 'admin' role
            var requiredUserRoles = (gitDeployment) ? ['soap_query', 'soap_script', 'cicd_integration_user'] : ['admin'];
            // get the sys_ids of the required roles
            var adminRole = '';
            var role = new GlideRecord('sys_user_role');
            if (role.get('name', 'admin')) {
                adminRole = role.getValue('sys_id');
            }

            var adminRoles = [];
            var roles = new GlideRecord('sys_user_role');
            roles.addQuery('name', 'IN', requiredUserRoles);
            roles._query();
            while (roles._next()) {
                adminRoles.push(roles.getValue('sys_id'));
            }

            var user;

            if (!autoCreateCdUser) {

                if (!sourceUserName || !sourcePassword)
                    throw Error('source credentials not specified');

                user = new GlideRecord('sys_user');
                if (!user.get('user_name', sourceUserName))
                    throw Error('source user not specified'); // same error as above to not expose user existence

                userSysId = user.getValue('sys_id');

                // check if use has right roles
                var roleAssignment = new GlideRecord('sys_user_has_role');
                roleAssignment.addQuery('user', userSysId);
                roleAssignment.addQuery('role', 'IN', adminRoles).addOrCondition('role', adminRole);
                roleAssignment.addQuery('state', 'active');
                roleAssignment._query();
                if (!roleAssignment._next())
                    throw Error('source user has not the appropriate role');

            } else {

                // create user on source instance
                var userUniqueId = sourceUrl.concat(' to ', targetEnvironment);
                user = new GlideRecord('sys_user');
                sourceUserName = '_CICD_DEPLOYMENT_'.concat(new GlideChecksum(userUniqueId).getMD5()).substr(0, 40);
                var firstName = 'CD-User for '.concat((gitDeployment) ? 'GIT' : 'source', ' based deployments')
                sourcePassword = null;

                if (user.get('user_name', sourceUserName)) {
                    userSysId = user.getValue('sys_id');
                    if (user.getValue('last_name') !== userUniqueId) {
                        user.setValue('first_name', firstName);
                        user.setValue('last_name', userUniqueId);
                        user.update();
                    }
                } else {
                    // create a random password
                    sourcePassword = GlideSecureRandomUtil.getSecureRandomString(100);

                    user.initialize();
                    user.setValue('user_name', sourceUserName);
                    user.setDisplayValue('user_password', sourcePassword);
                    user.setValue('first_name', firstName);
                    user.setValue('last_name', userUniqueId);
                    userSysId = user.insert();
                    if (!userSysId)
                        throw Error('CICdDeploy: User not created. sys_update_set_source on \'' + targetEnvironment + '\' for host \'' + sourceEnvironment + '\' needs to be created manually');

                }

                if (adminRoles.length == 0)
                    throw Error('CICdDeploy: admin role not found. ' + sourceUserName + ' will not have the correct grants to have this working');

                // assign or update the correct role to the _CICD_DEPLOYMENT_ user
                adminRoles.forEach(function (roleSysId) {
                    // check if use has right roles
                    var roleAssignment = new GlideRecord('sys_user_has_role');
                    roleAssignment.addQuery('user', userSysId);
                    roleAssignment.addQuery('role', roleSysId);
                    roleAssignment.addQuery('state', 'active');
                    roleAssignment._query();
                    if (!roleAssignment._next()) {
                        roleAssignment.initialize();
                        roleAssignment.setValue('user', userSysId);
                        roleAssignment.setValue('role', roleSysId);
                        roleAssignment.setValue('state', 'active');
                        roleAssignment.insert();
                    }
                });
            }

            // call target instance to load the update set
            var endpoint = targetEnvironment.concat(self.getBaseURI(), '/pull'), // pullUpdateSet()
                requestBody = {
                    sourceEnvironment: sourceEnvironment,
                    sourceUrl: sourceUrl,
                    gitDeployment: gitDeployment,
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
                var responseBody = JSON.parse(response.getBody()).result;
                var payload = {
                    // TODO: self.getAppVersion() not specified !
                    version: self.getAppVersion(),
                    sourceSysId: responseBody.sourceSysId,
                    targetEnvironment: responseBody.targetEnvironment,

                    updateSetSysId: updateSetSysId,
                    limitSet: limitSet, // <-- these are actually the US to be deployed

                    sourceEnvironment: sourceEnvironment,
                    deploy: Boolean(self.body.deploy),
                    collisionDetect: collisionDetect,
                    conflicts: self.body.conflicts,
                    step: 'loadUpdateSet'

                };
                return self._sendLocation(303, payload, targetEnvironment); // see other
            } else {
                var statusCode = response.getStatusCode();
                if (statusCode == 666) {
                    /* Something went wrong with the creation of 'sys_update_set_source', remove user from source.*/
                    self.teardownSource(roleSysId, userSysId);
                }
                throw Error(endpoint.concat(' Request ended in error. Code: ', statusCode, ', Message: ', response.getErrorMessage(), response.getBody()));
            }


        } catch (e) {
            self.console.error(e.message);
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
     * This is mapped to POST: /api/devops/v1/cicd/deploy_step
     * 
     * @returns {undefined}
     */
    processUpdateSetDeploySteps: function () {
        var self = this;

        try {

            if (GlidePluginManager.isUpgradeSystemBusy()) {
                self.console.error('[pullUpdateSet] Environment is upgrading');
                throw Error('pullUpdateSet: Environment is upgrading');
            }

            var payload = self.body;
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


    /**
     * Load update set to target environment
     * 
     * @param {any} payload
     * @returns {any}
     */
    _targetLoadUpdateSet: function (payload) {
        var self = this;

        var sourceSysId = payload.sourceSysId,
            limitSet = (payload.limitSet) ? Array.isArray(payload.limitSet) ? payload.limitSet : [payload.limitSet] : [];

        // unique list of any of the id's provided
        var cleanRemoteUpdateSets = [payload.updateSetSysId].concat(limitSet).filter(function (item, i, ar) { return ar.indexOf(item) === i; });
        /*
            if this update set was already loaded, delete it.
        */
        cleanRemoteUpdateSets.forEach(function (remoteSysId) {
            // in case of commitId ensure its short enough
            remoteSysId = remoteSysId.substr(0, 32);

            var lusSysId;
            var rus = new GlideRecord('sys_remote_update_set');
            rus.addQuery('remote_sys_id', 'STARTSWITH', remoteSysId).addOrCondition('origin_sys_id', 'STARTSWITH', remoteSysId);
            rus._query();
            if (rus._next()) {
                lusSysId = rus.getValue('update_set');

                self.console.info("[LOAD UPDATE SET] : deleting already loaded 'sys_remote_update_set' '{0}'", remoteSysId);
                rus.deleteRecord();
            }

            var lus = new GlideRecord('sys_update_set');
            if (lusSysId) {
                lus.addQuery('sys_id', lusSysId).addOrCondition('origin_sys_id', 'STARTSWITH', remoteSysId);
            } else {
                lus.addQuery('origin_sys_id', 'STARTSWITH', remoteSysId);
            }

            /*
                only delete if it was not changed (opened) on the target system since last deployment
            */
            lus.addQuery('sys_mod_count', '<=', 2);
            lus.addQuery('state', 'complete');
            lus._query();
            if (lus._next()) {
                self.console.info("[LOAD UPDATE SET] : deleting local update-set '{0}'", lus.getValue('sys_id'));
                lus.deleteRecord();
            } else if (lusSysId) {
                self.console.info("[LOAD UPDATE SET] : local update-set '{0}' was modified since deployment and will not be deleted.", lusSysId);
            }

        });

        self.console.info("[LOAD UPDATE SET] : Source SYS_ID {0}", sourceSysId);
        self.console.info("[LOAD UPDATE SET] : load update set {0}", limitSet);
        /*
            run worker to load the update set from remote
        */
        var worker = new GlideUpdateSetWorker();
        worker.setUpdateSourceSysId(sourceSysId); // the sys_update_set_source sys_id
        worker.setLimitSet(limitSet); // the update-set sys_id's / the id to load the update set
        worker.setBackground(true);
        worker.start();
        var progressId = worker.getProgressID();

        self.console.info("[LOAD UPDATE SET] : GlideUpdateSetWorker progress_id: '{0}'", String(progressId));

        self.assign(payload, {
            progressId: progressId,
            step: 'previewUpdateSet'
        });

        // job create, return 'accepted'
        return self._sendLocation(202, payload);
    },


    /**
     * Preview update set on target environment
     * 
     * @param {any} payload
     * @returns {undefined}
     */
    _targetPreviewUpdateSet: function (payload) {
        var self = this;

        var updateSetSysId = payload.updateSetSysId;

        /*
            in case the sys property 'glide.update_set.auto_preview' is not enabled, 
            manually run the preview.
        */
        var rus = new GlideRecord('sys_remote_update_set');
        rus.addQuery('remote_sys_id', 'STARTSWITH', updateSetSysId);
        rus.addQuery('state', '!=', 'committed');
        rus.orderByDesc('sys_created_on');
        rus.setLimit(1);
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
                code from /sys_script_include.do?sys_id=02ba7cd747103200a03a19fbac9a71bc
            */
            var progressId = (function () {
                if (rus.remote_base_update_set.nil()) {
                    self.console.info("[PREVIEW UPDATE SET] : Starting update set preview for: {0}", rus.name);
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
                        self.console.info("[PREVIEW UPDATE SET] : Cancelling existing execution tracker: {0}", updateSet.sys_id);
                        var previewer = new UpdateSetPreviewAjax();
                        previewer.sendCancelSignal(tracker.sys_id);
                    }
                    // END Cancel any running trackers on the batch

                    self.console.info("[PREVIEW UPDATE SET]: Starting update set batch preview for: {0}", updateSet.name);

                    return new HierarchyUpdateSetPreviewAjax().previewRemoteHierarchyUpdateSetAgain(updateSet);
                }
            })();

            self.console.info("[PREVIEW UPDATE SET] : UpdateSetPreviewer completed progress_id: {0}", progressId);

            self.assign(payload, {
                state: "previewing",
                progressId: progressId,
                remoteUpdateSetSysId: remoteUpdateSetSysId,
                step: 'commitUpdateSet'
            });

            // job create, return 'accepted'
            return self._sendLocation(202, payload);
        }

        throw Error('[Preview Update Set] Remote update-set not found with "remote_sys_id" ' + updateSetSysId);
    },


    /**
     * Commit update set on target environment
     * 
     * @param {any} payload
     * @returns {undefined}
     */
    _targetCommitUpdateSet: function (payload) {
        var self = this;
        var missingRecordActions = ['19415110bf010100421cdc2ecf07393c', '55711150bf010100421cdc2ecf07398e', '48d1d910bf010100421cdc2ecf0739b1']; // 'Find missing record', 'Find missing update', 'Find missing update'
        try {

            // check for conflicts and always resolve issues (during conflict detection and during deployment)
            if (GlidePreviewProblemHandler.hasUnresolvedProblems(payload.remoteUpdateSetSysId) && payload.conflicts && payload.conflicts.defaults) {

                var skip = (payload.conflicts.defaults.skip || '').split(',').map(function (m) { return m.trim(); }).filter(function (f) { return (f.length) });
                var ignore = (payload.conflicts.defaults.ignore || '').split(',').map(function (m) { return m.trim(); }).filter(function (f) { return (f.length) });
                var availableActions,
                    hasMissingRecordAction;

                if (skip.length) {
                    var skipProb = new GlideRecord('sys_update_preview_problem');
                    skipProb.addQuery('remote_update_set', payload.remoteUpdateSetSysId);
                    skipProb.addQuery('status', '');
                    var lenQuery;
                    skip.forEach(function (updateName, index) {
                        if (index == 0) {
                            lenQuery = skipProb.addQuery('remote_update.name', 'STARTSWITH', updateName);
                        } else {
                            lenQuery.addOrCondition('remote_update.name', 'STARTSWITH', updateName);
                        }
                    });

                    self.console.log('[Conflict Default Resolution Skip] Auto SKIP all problems of type : "{0}"', skip.join(', '));
                    //self.console.log('[Conflict Default Resolution Skip] auto SKIP all problems matching this query: "{0}"', skipProb.getEncodedQuery());
                    skipProb.query();
                    while (skipProb._next()) {
                        availableActions = skipProb.getValue('available_actions').split(',');
                        hasMissingRecordAction = missingRecordActions.some(function (mAction) { return availableActions.indexOf(mAction) >= 0 });
                        // don't auto skip if referenced record is not found. e.g. 'Could not find a record in ecc_agent for column mid_server referenced in this update'
                        if (hasMissingRecordAction)
                            continue;

                        self.console.log('[Conflict Default Resolution Skip] Setting {0} to status \'skipped\'', skipProb.remote_update.getDisplayValue());

                        //skipProb.setValue('status', 'skipped');
                        var ppa = new GlidePreviewProblemAction(new GlideAction(), skipProb);
                        ppa.skipUpdate(); // Problem has been skipped. The update that caused this problem will not be committed.

                        skipProb.setValue('description', '[CICD] - This issue was automatically SKIPPED by the CICD process (CICD_CD_DEPLOY_ALWAYS_SKIP_CONFLICTS)\n'.concat(skipProb.getValue('description')));
                        skipProb.update();
                    }
                }

                if (ignore.length) {
                    var ignProb = new GlideRecord('sys_update_preview_problem');
                    ignProb.addQuery('remote_update_set', payload.remoteUpdateSetSysId);
                    ignProb.addQuery('status', '');
                    var ignQuery;
                    ignore.forEach(function (updateName, index) {
                        if (index == 0) {
                            ignQuery = ignProb.addQuery('remote_update.name', 'STARTSWITH', updateName);
                        } else {
                            ignQuery.addOrCondition('remote_update.name', 'STARTSWITH', updateName);
                        }
                    });
                    self.console.log('[Conflict Default Resolution Ignore] Auto IGNORE all problems of type : "{0}"', ignore.join(', '));
                    //self.console.log('[Conflict Default Resolution Ignore] auto IGNORE all problems matching this query: "{0}"', ignProb.getEncodedQuery());
                    ignProb.query();
                    while (ignProb._next()) {
                        availableActions = ignProb.getValue('available_actions').split(',');
                        hasMissingRecordAction = missingRecordActions.some(function (mAction) { return availableActions.indexOf(mAction) >= 0 });
                        // don't auto ignore if referenced record is not found. e.g. 'Could not find a record in ecc_agent for column mid_server referenced in this update'
                        if (hasMissingRecordAction)
                            continue;

                        self.console.log('[Conflict Default Resolution Ignore] Setting {0} to status \'ignored\'', ignProb.remote_update.getDisplayValue());

                        //ignProb.setValue('status', 'ignored');
                        var ppa = new GlidePreviewProblemAction(new GlideAction(), ignProb);
                        ppa.ignoreProblem(); // Problem has been ignored

                        ignProb.setValue('description', '[CICD] - This issue was automatically IGNORED by the CICD process (CICD_CD_DEPLOY_ALWAYS_IGNORE_CONFLICTS)\n'.concat(ignProb.getValue('description')));
                        ignProb.update();
                    }
                }
            }

            // check again for conflicts and auto resolve conflicts
            if (!payload.collisionDetect && GlidePreviewProblemHandler.hasUnresolvedProblems(payload.remoteUpdateSetSysId) && payload.conflicts && payload.conflicts.resolutions) {
                // only resolve the problems with the provided resolutions if NOT in collisionDetect mode

                payload.missingRecords = {};

                var resolutions = payload.conflicts.resolutions;
                Object.keys(resolutions).forEach(function (updateName) {
                    /*
                    conflicts: {
                        resolutions: {
                            'sys_script_include_1b9ed113dbf32300fcf41780399619fc': {
                                status: 'skipped',
                                sysId: '1b9ed113dbf32300fcf41780399619fc',
                                className: 'sys_script_include',
                                updatedOn: 1567150552000
                            },
                        }
                        default: {
                            skip: 'sys_properties,sys_data_source,ldap_server_config,sys_rest_message_fn,sys_soap_message_function',
                            ignore: 'sys_bla'
                        }

                    }
                    */
                    var resolution = resolutions[updateName];
                    var status = resolution.status;
                    var sysId = resolution.sysId;
                    var updatedOn = resolution.updatedOn;


                    var problem = new GlideRecord('sys_update_preview_problem');
                    problem.addQuery('remote_update_set', payload.remoteUpdateSetSysId);
                    problem.addQuery('remote_update.name', updateName);
                    problem.addQuery('status', '');
                    problem.setLimit(1);
                    problem.query();
                    if (problem._next()) {

                        if (status == 'skipped') {// skipped = 'Skip remote update'
                            // this change can be ignored
                            self.console.log('[Auto Conflict resolution] set this record to "SKIPPED" : {0}', gs.getProperty('glide.servlet.uri').concat(problem.getLink(true)));
                            
                            //problem.setValue('status', status);
                            var ppa = new GlidePreviewProblemAction(new GlideAction(), problem);
                            ppa.skipUpdate(); // Problem has been skipped. The update that caused this problem will not be committed.

                            problem.setValue('description', '[CICD] - This issue was automatically SKIPPED by the CICD process (based on preflight conflict resolution)\n'.concat(problem.getValue('description')));
                            problem.update();
                            
                        } else if (status == 'ignored') { // ignored = 'Accept remote update'
                            // check if the local record is by any chance newer than the one we should accept
                            // this can be the case if there was another deployment to target from another dev environment
                            var newerLocalFile = (function () {
                                if (sysId && updatedOn) {
                                    var file = new GlideRecord("sys_metadata");
                                    if (file.get(sysId)) {
                                        var localUpdatedOn = new GlideDateTime(file.getValue('sys_updated_on')).getNumericValue();
                                        if (localUpdatedOn > updatedOn) {
                                            self.console.error("[Conflict Resolution - Accept incoming change] the local record {0} is newer than an incoming one {1}", gs.getProperty('glide.servlet.uri').concat(file.getLink(true)), gs.getProperty('glide.servlet.uri').concat(problem.getLink(true)));
                                            return true;
                                        }
                                    }
                                }
                                return false;
                            })();

                            if (!newerLocalFile) {

                                var availableActions = problem.getValue('available_actions');
                                var isMissingRecord = missingRecordActions.some(function (action) {
                                    return availableActions.includes(action);
                                });
                                if (isMissingRecord) {
                                    resolution.link = gs.getProperty('glide.servlet.uri').concat(problem.getLink(true));
                                    resolution.description = problem.getValue('description');
                                    payload.missingRecords[updateName] = resolution;
                                }

                                // this change can be accepted
                                self.console.log('[Auto Conflict resolution] set this record to "IGNORED" : {0}', gs.getProperty('glide.servlet.uri').concat(problem.getLink(true)));
                                
                                //problem.setValue('status', status);
                                var ppa = new GlidePreviewProblemAction(new GlideAction(), problem);
                                ppa.ignoreProblem(); // Problem has been ignored

                                problem.setValue('description', '[CICD] - This issue was automatically IGNORED by the CICD process (based on preflight conflict resolution)\n'.concat(problem.getValue('description')));
                                problem.update();
                            }
                        }
                    }
                });
            }

            var error = {
                name: 'Preview Review Problem',
                message: '',
                updateSet: gs.getProperty('glide.servlet.uri').concat('sys_remote_update_set.do?sys_id=', payload.remoteUpdateSetSysId),
                issues: false,
                previewProblems: [],
                dataLossWarnings: []
            };


            // check again for conflicts
            if (!GlidePreviewProblemHandler.hasUnresolvedProblems(payload.remoteUpdateSetSysId)) {
                // if no collisions detected and in detection mode, remove the preview update set
                if (payload.collisionDetect) {
                    var delRus = new GlideRecord('sys_remote_update_set');
                    if (delRus.get(payload.remoteUpdateSetSysId)) {
                        delRus.deleteRecord();
                    }
                }
            } else {
                // there are unresolved problems
                if (payload.collisionDetect) {
                    // change the name of the remote update set to indicate this is only a dry run to find the conflicts
                    var updRus = new GlideRecord('sys_remote_update_set');
                    if (updRus.get(payload.remoteUpdateSetSysId)) {
                        updRus.setValue('state', self.REQUIRES_REVIEW);
                        updRus.setValue('name', '[CICD PREFLIGHT] - '.concat(updRus.getValue('name')))
                        updRus.update();
                    }
                }

                var problem = new GlideRecord('sys_update_preview_problem');
                problem.addQuery('type=error^status=^'.concat('remote_update_set=', payload.remoteUpdateSetSysId, '^ORremote_update_set.remote_base_update_set=', payload.remoteUpdateSetSysId));
                problem._query();
                while (problem._next()) {
                    error.previewProblems.push({
                        type: problem.getValue('type'),
                        name: problem.getValue('description'),
                        link: gs.getProperty('glide.servlet.uri').concat(problem.getLink(true))
                    });
                }
                if (error.previewProblems.length) {
                    error.issues = true;
                    error.message += '- Update conflicts must be resolved manually. '
                }

            }

            // check for data loss warnings
            var ignoreDataLoss = (payload.conflicts.defaults.ignoreDataLoss || false);

            if (!ignoreDataLoss) {
                var del = new GlideRecord('sys_update_xml');
                del.addQuery('action=DELETE^'.concat('remote_update_set=', payload.remoteUpdateSetSysId, '^ORremote_update_set.remote_base_update_set=', payload.remoteUpdateSetSysId, '^nameDOES NOT CONTAINsys_dictionary_override^nameSTARTSWITHsys_dictionary^ORnameSTARTSWITHsys_db_object^ORnameSTARTSWITHvar_dictionary^ORnameSTARTSWITHsvc_extension_variable^ORnameSTARTSWITHwf_activity_variable^ORnameSTARTSWITHatf_input_variable^ORnameSTARTSWITHatf_output_variable^ORnameSTARTSWITHsys_atf_variable^ORnameSTARTSWITHsys_atf_remembered_values^ORDERBYtype^ORDERBYname'));
                del._query();
                self.console.warn('DATALOSS QUERY sys_update_xml : {0}', del.getEncodedQuery())
                while (del._next()) {
                    error.dataLossWarnings.push({
                        type: del.getValue('name'),
                        name: 'Data Loss Warning',
                        link: gs.getProperty('glide.servlet.uri').concat(del.getLink(true))
                    });
                }
                if (error.dataLossWarnings.length) {
                    error.issues = true;
                    error.message += '- Data Loss Warnings'
                }
            }

            // in case of some issues exit here
            if (error.issues) {
                self.response.setStatus(409);
                // also send the payload back
                error.payload = payload;
                return self.response.setBody({
                    code: 409,
                    error: error,
                    status: 'failure'
                });
            }

            // only commit if 'deploy' is set
            var progressId = null;
            if (!payload.collisionDetect && payload.deploy) {
                if (GlidePreviewProblemHandler.hasUnresolvedProblems(payload.remoteUpdateSetSysId))
                    throw Error("UpdateSet still has unresolved problems and can not be deployed: " + payload.remoteUpdateSetSysId);

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
                                /**
                                 * Description
                                 * 
                                 * @param {any} paramName
                                 * @returns {MemberExpression}
                                 */
                                getParameter: function (paramName) {
                                    return params[paramName];
                                }
                            };
                        })(), new GlideXMLDocument(), '').process();
                        progressId = commitResult.split(',')[0];
                    } else {
                        /*
                            HierarchyUpdateSetCommitAjax
                            code from /sys_ui_action.do?sys_id=addc9e275bb01200abe48d5511f91a78
                            calling /sys_script_include.do?sys_id=fcfc9e275bb01200abe48d5511f91aea
                        */
                        var updateSet = new GlideRecord("sys_remote_update_set");
                        if (updateSet.get(rus.remote_base_update_set)) {
                            var worker = new SNC.HierarchyUpdateSetScriptable();
                            progressId = worker.commitHierarchy(updateSet.sys_id);
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
                progressId: progressId,
                step: 'deploymentComplete'
            });

            return self._sendLocation(202, payload); // job create, return 'accepted'

        } catch (e) {
            gs.error(e.message);
            return new sn_ws_err.BadRequestError(e.message);

        }
    },

    /**
     * Return complete message
     * 
     * @param {any} payload
     * @returns {any} payload
     */
    _targetDeploymentComplete: function (payload) {
        if (payload.collisionDetect)
            return payload;

        payload.state = (payload.deploy) ? 'committed' : 'delivered';
        if (payload.deploy) {
            var us = new GlideRecord('sys_update_set');
            if (us.get('remote_sys_id', payload.remoteUpdateSetSysId)) {
                payload.targetUpdateSetSysId = us.getValue('sys_id');
            }
        }
        return payload;
    },


    /**
     * Send redirect location (long polling)
     * 
     * @param {any} status
     * @param {any} payload
     * @param {any} host
     * @returns {any}
     */
    _sendLocation: function (status, payload, host) {
        var self = this;
        /*
        var queryParams = Object.keys(payload).map(function (key) {
            return key.concat('=', encodeURIComponent(payload[key]));
        });
        */
        var uri = (host || gs.getProperty('glide.servlet.uri')).toLowerCase().replace(/\/$/, "");

        self.response.setStatus(202);
        payload._status = status;
        self.response.setHeader("Location",
            uri.concat(self.getBaseURI(), '/deploy_step?__step=', payload.step, '&__status=', status)
        );
        return self.response.setBody(payload);
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
            sourceSysId;//sourceEnvironment, sourceUrl, updateSetSysId, limitSet, deploy, collisionDetect;

        try {

            if (!self.body) {
                self.console.error('no request payload found');
                throw Error('pullUpdateSet: no request payload found');
            }
            [self.body.sourceEnvironment].forEach(function (param) {
                if (gs.nil(param))
                    throw Error('sourceEnvironment are mandatory');
            });

            if (!gs.getUser().getRoles().contains('admin'))
                throw Error('CD User must have admin grants. User: '.concat(gs.getUserName(), ' Roles', gs.getUser().getRoles().toString()));
            /*
                create a dynamic source definition
            */
            try {

                var sourceEnvironment = self.body.sourceEnvironment.toLowerCase();
                var sourceUrl = (self.body.sourceUrl || sourceEnvironment).trim();
                var gitDeployment = self.body.gitDeployment || false;
                var credentials;

                //updateSetSysId = self.body.updateSetSysId;
                //limitSet = self.body.limitSet;
                //deploy = self.body.deploy || false;
                //collisionDetect = self.body.collisionDetect || false;

                var source = new GlideRecord('sys_update_set_source'),
                    name = new GlideChecksum(sourceUrl).getMD5().substr(0, 40),
                    desc = 'CICD deployment source for '.concat(sourceUrl, '. DO NOT DELETE OR CHANGE!');

                var noSlashUrl = sourceUrl.replace(/\/$/, "");
                if (source.get('url', noSlashUrl) || source.get('url', noSlashUrl + '/')) {
                    sourceSysId = source.getValue('sys_id');
                    // in case the credentials changed, update
                    credentials = self.body.credentials || {};
                    if (credentials.password && credentials.user) {
                        source.setValue('username', credentials.user);
                        source.setValue('password', new GlideEncrypter().decrypt(credentials.password));
                        source.setWorkflow(false);
                        source.update();
                    }
                } else {
                    credentials = self.body.credentials || {};

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
                    throw Error('Somethings wrong with the creation of sys_update_set_source. CD User must have admin grants. '.concat(gs.getUserName(), ' Roles', gs.getUser().getRoles().toString()));

                gs.info("[CICD] : pullUpdateSet() sys_update_set_source {0}", sourceSysId);

            } catch (e) {
                gs.error("[CICD] : Source creation failed {0}", e.message || e)
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
                sourceSysId: sourceSysId,
                targetEnvironment: gs.getProperty('glide.servlet.uri').toLowerCase(),
            };

            return payload;

        } catch (e) {
            self.console.error(e.message);
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
