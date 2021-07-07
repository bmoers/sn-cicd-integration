/**
 * Various API to prevent CICD process direct connecting to table API
 * 
 * @class 
 * @author Boris Moers
 * @requires sn_ws_err.module:sys_script_include.BadRequestError
 * @requires global.module:sys_script_include.UpdateSetExport
 * @requires global.module:sys_script_include.TableUtils
 * @requires sn_ws_err.module:sys_script_include.NotFoundError
 * @memberof global.module:sys_script_include
 */
var CiCdApi = Class.create();

CiCdApi.prototype = /** @lends global.module:sys_script_include.CiCdApi.prototype */ {

    CICD_INTEGRATION_APP_ID: '19190fabdbebd300dfa9b94ffe96193e',

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
            }
        };

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
     * @returns {ConditionalExpression}
     */
    getQueryParam: function (paramName, defaultValue) {
        var self = this;

        return (paramName in self.request.queryParams) ? (function () {
            var value = self.request.queryParams[paramName];
            if (Array.isArray(value)) {
                return (value.length === 1) ? value[0] : value;
            } else {
                return value;
            }
        })() : defaultValue;
    },

    /**
     * Get the application version
     * 
     * mapped to GET /api/devops/v1/cicd/version/
     * 
     * @returns {Array} the CICD Integration App Version
     */
    getAppVersion: function () {
        var self = this;
        var gr = new GlideRecord('sys_scope');
        if (gr.get(self.CICD_INTEGRATION_APP_ID)) {
            return gr.getValue('version').split('.');
        }
        return [0, 0, 0];
    },

    /**
     * Get User information by userId
     * 
     * mapped to GET /api/devops/v1/cicd/user/{userId}
     * 
     * @param {String} userId value of the user_name field
     * @returns {any} the user details
     */
    getUserById: function (userId) {
        var self = this;

        return self._getGrResultStream('sys_user', null, {
            sysparm_limit: 1,
            sysparm_query: 'user_name=' + userId,
            sysparm_fields: 'sys_id, name, email'
        });

    },

    /**
     * Get the details of an update-set
     * 
     * mapped to GET /api/devops/v1/cicd/updateset/{updateSetSysId}
     * 
     * @param {String} updateSetSysId
     * @returns {any} the update-set details
     */
    getUpdateSetDetails: function (updateSetSysId) {
        var self = this;

        return self._getGrResultStream('sys_update_set', updateSetSysId, {});
    },


    /**
     * Get the details of an Scope / App
     * 
     * mapped to GET /api/devops/v1/cicd/scope/{scopeId}
     * 
     * @param {String} scopeId
     * @returns {any} the update-set details
     */
    getScopeDetails: function (scopeId) {
        var self = this;

        return self._getGrResultStream('sys_scope', scopeId, {});
    },

    /**
     * Get all XMl records of an update-set
     * 
     * mapped to GET /api/devops/v1/cicd/updateset_files/{updateSetSysId}
     * 
     * @param {String} updateSetSysId
     * @returns {any} the update-set XML records
     */
    getUpdateSetFiles: function (updateSetSysId) {
        var self = this;

        return self._getGrResultStream('sys_update_xml', null, {
            sysparm_limit: 50,
            sysparm_query: 'update_set.base_update_set=' + updateSetSysId + '^ORupdate_set=' + updateSetSysId + '^ORDERBYsys_recorded_at'
        });

    },

    /**
     * Export an update-set
     * 
     * mapped to GET /api/devops/v1/cicd/export_updateset/{updateSetSysId}
     * @param {any} updateSetSysId
     * @returns {undefined} all test assigned to a test suite
     */
    exportUpdateSet: function (updateSetSysId) {
        var self = this, sysId;

        if (!updateSetSysId)
            return new sn_ws_err.BadRequestError('Update-Set is mandatory');

        var current = new GlideRecord('sys_update_set');
        /*
        current.addEncodedQuery('state=complete^sys_id='.concat(updateSetSysId));
        current._query();
        if(!current._next())
            return new sn_ws_err.BadRequestError('Update-Set Not found. Is it completed?');
        */
        if (!current.get(updateSetSysId))
            return new sn_ws_err.BadRequestError('Update-Set Not found.');

        var updateSetExport = new UpdateSetExport();
        if (current.base_update_set == current.sys_id) {
            sysId = updateSetExport.exportHierarchy(current);

            response.setStatus(302);
            return response.setLocation([gs.getProperty('glide.servlet.uri'), 'cicd_export_base_update_set.do?sysparm_delete_when_done=true&sysparm_sys_id=', sysId].join(''));

        } else if (current.base_update_set.nil()) {
            sysId = updateSetExport.exportUpdateSet(current);

            response.setStatus(302);
            return response.setLocation([gs.getProperty('glide.servlet.uri'), 'cicd_export_update_set.do?sysparm_delete_when_done=true&sysparm_sys_id=', sysId].join(''));

        } else {
            return new sn_ws_err.BadRequestError('Somethings wrong here... '.concat(current.getEncodedQuery()));
        }

    },


    /**
     * convert a scoped app to update-set
     * used in CiCdRun().sys_appUiAction() and exposed on GET to /api/devops/cicd/export_application/{appId}
     * 
     * @param {*} appId
     * @returns {any}
     */
    publishToUpdateSet: function (appId) {
        var self = this;

        if (!gs.getUser().getRoles().contains('admin'))
            throw Error('User must have admin grants.');

        var sc = new GlideRecord('sys_app');
        if (!sc.get(appId))
            throw Error("application not found");

        // the sysId of the update set
        var sysId = new GlideChecksum(sc.getValue('name').concat(sc.getValue('version'), sc.getValue('sys_id'), gs.getProperty('instance_name'))).getMD5();
        var singleUpdateSet = Boolean(gs.getProperty('cicd-integration.scoped-app.single-update-set', 'false') == 'true');

        if (singleUpdateSet) {
            // check if there is already a pending run
            var checkUs = new GlideRecord('sys_update_set');
            checkUs.addQuery('sys_id', sysId);
            checkUs.addQuery('state', '!=', 'complete');
            checkUs.addQuery('state', '!=', 'ignore');
            checkUs.addQuery('state', '!=', 'Do not transport');
            checkUs.setLimit(1);
            checkUs.query();
            if (checkUs._next()) {

                self.console.error('[publishToUpdateSet] There is already a running CICD run {0}', sysId.toString());

                var error = new Error("There is already a CICD run in progress for this application.");
                error.code = "ALREADY_RUNNING"
                error.link = gs.getProperty('glide.servlet.uri').concat(checkUs.getLink(true));

                throw error;

            }
        }

        var usm = new GlideUpdateManager2();
        var gus = new GlideUpdateSet();
        var currentUS = gus.get();

        //gs.setCurrentApplicationId(appId);
        var queryStore = {};
        // add scope to update set
        queryStore[sc.getRecordClassName()] = [appId];

        self.console.info('[publishToUpdateSet] create new update set');
        var us = new GlideRecord('sys_update_set');
        if (singleUpdateSet) {
            if (us.get(sysId)) {
                self.console.info('[publishToUpdateSet] Deleting existing version of this update set {0}', sysId.toString());
                us.deleteRecord();
            }
            us.newRecord();
            us.setValue('sys_id', sysId);
        } else {
            us.initialize();
        }
        us.setValue('name', sc.getValue('name').concat(' - ', sc.getValue('version')));
        us.setValue('application', appId);
        us.setValue('state', 'build');
        us.setValue('description', 'Automatically created by CICD Process'.concat(sc.getValue('short_description') ? '\n'.concat(sc.getValue('short_description')) : ''));
        var updateSetSysId = us.insert();

        // make new update-set active
        gus.set(updateSetSysId);

        /*
            as OOB sys_metadata_link records are not exported into an update set, this seems to be even the 
            better way of doing it.
            e.g add a trigger via "add to application" ui action to a scoped app (this will create a sys_metadata_link record), export the app as update set (via ui action)
            and the sys_metadata_link is missing.

            sys_metadata_link flags are:

            'new install & upgrade'    > directory == 'update'
            'new install'              > directory == 'unload'
            'new install & demo data'  > directory == 'unload.demo'

            TODO: switch to exclude demo data
        */
        var meta = new GlideRecord('sys_metadata');
        meta.addQuery('sys_scope', appId);
        meta._query();

        while (meta._next()) {
            var className = meta.getRecordClassName();

            if ('sys_ui_list' == className) {
                var tmp = new GlideRecord(className);
                if (tmp.get(meta.getValue('sys_id'))) {
                    var tableName = tmp.getValue('name');
                    if (new TableUtils(tableName).getAbsoluteBase() != 'sys_metadata') // this works like OOB, but is wrong. correct would be: !new TableUtils(tableName).getHierarchy().some(function (name) { return (name == 'sys_metadata')})
                        continue;
                    if (!gs.nil(tmp.sys_user))
                        continue;
                }
            }

            if (queryStore[className] === undefined)
                queryStore[className] = [];

            queryStore[className].push(meta.getValue('sys_id'))
        }

        self.console.info('[publishToUpdateSet] add all files to the update set');
        Object.keys(queryStore).forEach(function (tableName) {
            self.console.info('[publishToUpdateSet] add ' + queryStore[tableName].length + ' files from ' + tableName);
            var appFiles = new GlideRecord(tableName);
            appFiles.addQuery('sys_id', 'IN', queryStore[tableName]);
            appFiles._query();
            while (appFiles._next()) {
                // make new update-set active -- in case multiple jobs run at the same time
                gus.set(updateSetSysId);
                // save the record to the update set
                usm.saveRecord(appFiles);
            }
        });

        gus.set(currentUS);

        return {
            updateSetSysId: updateSetSysId
        };

    },



    /**
     * Get all ATF Test which are assigned to a TestSuite. <br>
     * This is used to exclude the test from the ATF runs to avoid running twice.
     * 
     * mapped to GET /api/devops/v1/cicd/test_in_suites
     * @returns {any} all test assigned to a test suite
     */
    getAllTestInSuites: function () {
        var self = this;
        return self._getGrResultStream('sys_atf_test_suite_test', null, {
            sysparm_query: 'test_suite.active=true^test.active=true',
            sysparm_fields: 'test'
        });
    },

    /**
     * This is a wrapper to give access to any kind of table extending sys_metadata
     * 
     * mapped to GET /api/devops/v1/cicd/file/{tableName}
     * 
     * @param {String} tableName the table to read from
     * @returns {any} the records from the corresponding table
     */
    getFilesFromTable: function (tableName) {
        var self = this;

        if ('sys_metadata' != tableName || 'sys_scope' != tableName) {
            var pass = new TableUtils(tableName).getHierarchy().toArray().some(function (table) {
                return ('sys_metadata' == table || 'sys_scope' == table);
            });
            if (!pass)
                return [];
        }
        return self._getGrResultStream(tableName, null, {});
    },

    /**
     * Change the state of an update-set
     * 
     * mapped to PATCH /api/devops/v1/cicd/updateset_status/{updateSetSysId}
     * 
     * @param {String} updateSetSysId the update-set sys_id
     * @returns {undefined} the update-set
     */
    setUpdateSetStatus: function (updateSetSysId) {
        var self = this;

        var state = (self.body) ? self.body.state : undefined;
        if (state === undefined)
            return new sn_ws_err.BadRequestError('State is mandatory');

        var gr = new GlideRecord('sys_update_set');
        if (gr.get(updateSetSysId)) {
            gr.setValue('state', state);
            gr.update('CI - State Changed');
            return self._getGrResultStream('sys_update_set', updateSetSysId, {
                sysparm_suppress_pagination_header: 'true'
            });
        } else {
            return new sn_ws_err.NotFoundError('No Record found.');
        }
    },


    /**
     * Description
     * 
     * @param {any} limit
     * @param {any} offset
     * @param {any} rel
     * @returns {any}
     */
    _createLink: function (limit, offset, rel) {
        var self = this;
        var queryParams = Object.keys(self.request.queryParams).reduce(function (prev, key) {
            if (['sysparm_limit', 'sysparm_offset'].indexOf(key) === -1) {
                return prev.concat([key.concat('=', encodeURIComponent(self.getQueryParam(key)))]);
            }
            return prev;
        }, []);
        return ''.concat('<', self.request.url, '?', queryParams.concat(['sysparm_limit=' + limit, 'sysparm_offset=' + offset]).join('&'), '>', ';rel="', rel, '"');
    },

    /**
     * Description
     * 
     * @param {any} tableName
     * @param {any} sysId
     * @param {any} defaultParams
     * @returns {undefined}
     */
    _getGrResultStream: function (tableName, sysId, defaultParams) {

        var self = this;

        defaultParams = defaultParams || {};
        var singleObject = Boolean(sysId);
        if (singleObject) {
            defaultParams.sysparm_suppress_pagination_header = 'true';
        }

        var query = defaultParams.sysparm_query || self.getQueryParam('sysparm_query');
        var fields = defaultParams.sysparm_fields || self.getQueryParam('sysparm_fields');
        fields = (fields) ? fields.split(',') : [];

        var offset = parseInt(self.getQueryParam('sysparm_offset', 0), 10);
        var limit = parseInt(self.getQueryParam('sysparm_limit', defaultParams.sysparm_limit || 10000), 10);

        var displayValue = self.getQueryParam('sysparm_display_value', 'false');
        var category = self.getQueryParam('sysparm_query_category');
        var addDependents = defaultParams.sysparm_add_dependents || self.getQueryParam('sysparm_add_dependents', 'false');

        var suppressPaginationLink = defaultParams.sysparm_suppress_pagination_header || self.getQueryParam('sysparm_suppress_pagination_header', 'false');


        // not implemented....
        var excludeRefLink = self.getQueryParam('sysparm_exclude_reference_link', 'false');
        var view = self.getQueryParam('sysparm_view');


        // query the table
        var gr = new GlideRecord(tableName);

        // init so gr has all fields
        gr.initialize();

        // in case no fields specified, use all (only possible after .next())
        if (fields.length === 0) {
            fields = Object.keys(gr);
        }

        // allow query fields to be in url. e.g. active=true
        Object.keys(self.request.queryParams).forEach(function (key) {
            if (key.indexOf('sysparm_') === 0 || gr[key] === undefined)
                return;
            query = ((query) ? query.concat('^') : '').concat(key, '=', self.getQueryParam(key));
        });

        if (sysId) {
            gr.addQuery('sys_id', sysId);
        } else if (query) {
            gr.addQuery(query);
        }

        if (category)
            gr.setCategory(category);

        var onPage = Math.ceil((offset + 1) / limit),
            thisOffset = offset + limit;

        // set window
        gr.chooseWindow(offset, thisOffset, true);
        //gr.setLimit(nextOffset);
        gr._query();

        var totalRows = gr.getRowCount();

        // send 404 in case no row match
        if (totalRows === 0) {
            return [];//new sn_ws_err.NotFoundError('No Record found. Query: '.concat(query));
        }

        var totalPage = Math.ceil(totalRows / limit),
            prevOffset = offset - limit,
            nextOffset = Math.min(thisOffset, (totalPage - 1) * limit),
            lastOffset = (totalPage - 1) * limit;

        self.response.setContentType('application/json');

        var links = [];
        if ('true' != suppressPaginationLink) {
            links.push(self._createLink(limit, 0, 'first'));
            if (onPage > 1) {
                links.push(self._createLink(limit, prevOffset, 'prev'));
            }
            if (onPage < totalPage) {
                links.push(self._createLink(limit, nextOffset, 'next'));
            }
            links.push(self._createLink(limit, lastOffset, 'last'));
            // append to header
            self.response.setHeader("Link", links.join(','));
        }

        self.response.setStatus(200);

        // get the writer
        var writer = response.getStreamWriter();
        // start the result
        writer.writeString('{"result":');
        if (!singleObject) {
            writer.writeString('[');
        }
        //writer.writeString(JSON.stringify(self.request.queryParams));

        var append = false;
        // stream row by row
        while (gr._next()) {

            if (append) {
                writer.writeString(',');
            } else {
                append = true;
            }

            var out = {};
            fields.forEach(function (fieldName) {
                fieldName = fieldName.trim();

                if (!gr.isValidField(fieldName.split('.')[0]))
                    return;

                var element = gr.getElement(fieldName);
                var ed = element.getED(),
                    value = null;
                /*
                .nil() is also true if a filed has length 0 !!
                if (element.nil()) {
                    value = null;
                } else
                */

                if (ed.isBoolean()) {
                    value = JSUtil.toBoolean(element.toString());
                } else if (ed.isTrulyNumber()) {
                    value = parseInt(element.toString(), 10);
                } else {
                    value = element.toString();
                }

                if ('all' == displayValue.toLowerCase()) {
                    out[fieldName] = {
                        display_value: element.getDisplayValue(),
                        value: value
                    };
                } else if ('true' == displayValue.toLowerCase()) {
                    out[fieldName] = element.getDisplayValue();
                } else {
                    out[fieldName] = value;
                }
            });

            if (addDependents == 'true') {
                var __dependents = [];
                var __dependentsDelete = [];

                self._getDependents(gr).forEach(function (dependent) {
                    var depOut = null;
                    if (dependent.sysId) {
                        var dep = new GlideRecord(dependent.className);
                        if (dep.get(dependent.sysId)) {
                            depOut = { __className: dependent.className };
                            Object.keys(dep).forEach(function (fieldName) {
                                fieldName = fieldName.trim();

                                if (!dep.isValidField(fieldName.split('.')[0]))
                                    return;

                                var element = dep.getElement(fieldName);
                                var ed = element.getED(),
                                    value = null;

                                if (ed.isBoolean()) {
                                    value = JSUtil.toBoolean(element.toString());
                                } else if (ed.isTrulyNumber()) {
                                    value = parseInt(element.toString(), 10);
                                } else {
                                    value = element.toString();
                                }

                                if ('all' == displayValue.toLowerCase()) {
                                    depOut[fieldName] = {
                                        display_value: element.getDisplayValue(),
                                        value: value
                                    };
                                } else if ('true' == displayValue.toLowerCase()) {
                                    depOut[fieldName] = element.getDisplayValue();
                                } else {
                                    depOut[fieldName] = value;
                                }
                            });

                            __dependents.push(depOut);

                        }

                    } else {
                        depOut = dependent;
                        depOut.__className = dependent.className;
                        delete depOut.className;
                        delete depOut.sys_id;
                        __dependentsDelete.push(depOut);
                    }
                })

                if (__dependents.length) {
                    out.__dependents = __dependents;
                }
                if (__dependentsDelete.length) {
                    out.__dependentsDelete = __dependentsDelete;
                }
            }
            writer.writeString(JSON.stringify(out));

        }
        if (!singleObject) {
            writer.writeString(']');
        }

        if (self.getQueryParam('sysparm_meta', 'false') == 'true') {
            // append meta information
            var meta = {
                query: query,
                queryParams: self.request.queryParams,
                sysId: sysId,
                fields: fields,
                offsetWindowStart: offset,
                offsetWindowEnd: thisOffset,
                limit: limit,
                totalRows: totalRows,
                totalPage: totalPage,
                prevOffset: prevOffset,
                nextOffset: nextOffset,
                lastOffset: lastOffset,
                displayValue: displayValue,
                category: category,
                links: links
            };
            writer.writeString(',"__meta":');
            writer.writeString(JSON.stringify(meta));
        }

        // close the result
        writer.writeString('}');

    },

    _getDependents: function (gr) {
        /*
        [{
            "className": "sys_variable_value",
            "sysId": null,
            "action": "delete_multiple",
            "query": "document_key=9000a4560b10220050192f15d6673a3e"
        }, {
            "className": "sys_variable_value",
            "sysId": "c2faf2a35320220002c6435723dc3489",
            "action": "INSERT_OR_UPDATE"
        }]

        */
        var self = this;
        if (!self.glideRecordSimpleSerializer) {
            self.glideRecordSimpleSerializer = new GlideRecordSimpleSerializer();
        }

        var xmlString = self.glideRecordSimpleSerializer.serialize(gr);

        var xmlDoc = new XMLDocument(xmlString);
        var nodeList = xmlDoc.getNodes("//" + gr.getTableName() + "/*[@action]");
        var a = [];

        for (var i = 0; i < nodeList.getLength(); i++) {
            var item = nodeList.item(i);

            if (gr.getTableName() == item.getNodeName())
                return;

            var meta = { className: item.getNodeName(), sysId: xmlDoc.getChildTextByTagName(item, "sys_id") };

            var attributes = item.getAttributes();
            for (var j = 0; j < attributes.getLength(); j++) {
                var att = attributes.item(j);
                if (att.getNodeName() == 'action') {
                    meta.action = att.getNodeValue();
                } else if (att.getNodeName() == 'query') {
                    meta.query = att.getNodeValue();
                }
            }

            a.push(meta);
        }
        return a;
    },

    type: 'CiCdApi'
};
