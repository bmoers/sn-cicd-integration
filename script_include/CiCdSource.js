/* exported CiCdSource */
/* global gs, sn_ws, sn_ws_err, Class, GlideEncrypter, GlideSecureRandomUtil, GlideUpdateSetWorker, GlideDateTime, GlideRecord, GlideProperties, JSON */

/**
 * CDCD Trigger to execute run in CICD Server
 * 
 * @class 
 * @author Boris Moers
 * @requires sn_ws.module:sys_script_include.RESTMessageV2
 * @memberof global.module:sys_script_include
 */
var CiCdSource = Class.create();

CiCdSource.prototype = /** @lends global.module:sys_script_include.CiCdSource.prototype */ {

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

        self.console = {
            log: function () {
                if (arguments.length) arguments[0] = '[' + self.type + '] ' + arguments[0];
                gs.info.apply(null, arguments);
            },
            warn: function () {
                if (arguments.length) arguments[0] = '[' + self.type + '] ' + arguments[0];
                gs.warn.apply(null, arguments);
            },
            error: function () {
                if (arguments.length) arguments[0] = '[' + self.type + '] ' + arguments[0];
                gs.error.apply(null, arguments);
            },
            debug: function () {
                if (arguments.length) arguments[0] = '[' + self.type + '] ' + arguments[0];
                gs.debug.apply(null, arguments);
            },
        };

        var cicdServerMatch = gs.getProperty('cicd-integration.server.url', '').match(/((?:http[s]?:\/\/)[^\/]*)/i);
        var cicdServer = (cicdServerMatch) ? cicdServerMatch[1] : 'server-undefined';

        self.settings = self.assign({
            cicdEnabled: Boolean(gs.getProperty('cicd-integration.enabled', 'false') == 'true'),
            throughMidServer: Boolean(gs.getProperty('cicd-integration.server.through-mid', 'false') == 'true'),
            midServerName: gs.getProperty('cicd-integration.server.mid-server-name', self.getMidServer()),
            cicdServerExportURL: cicdServer.concat('/source')
        }, JSON.parse(JSON.stringify(settings || {})));
    },


    /**
     * proxy request to CICD server to get UpdateSet details
     * @param {*} commitId 
     */
    _getUpdateSet: function (commitId) {
        var self = this;

        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'MID Server not defined';
            request.setMIDServer(self.settings.midServerName);
        }

        request.setEndpoint(self.settings.cicdServerExportURL.concat('/update_set/', commitId));
        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Content-Type", "application/json");
        request.setHttpMethod('GET');

        //self.console.log('Settings {0}', JSON.stringify(self.settings));
        //self.console.log('CommitId {0}', commitId);
        //self.console.log("URL: {0}", request.getEndpoint());

        var response = request.execute(); // Async somehow does not perform
        if (!response.haveError()) {
            try {
                var responseJson = JSON.parse(response.getBody());
                //self.console.log("successful - result is: {0}", JSON.stringify(responseJson));
                return responseJson;

            } catch (e) {
                self.console.error("JSON parsing failed. Text: {0}, Error:", response.getBody(), e);
                throw e;
            }
        } else {
            var statusCode = response.getStatusCode();
            self.console.error("request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}", statusCode, response.getErrorMessage(), request.getEndpoint(), response.getBody());
            throw new Error(response.getErrorMessage());
        }
    },

    /**
     * proxy request to CICD server to get Scope details
     * @param {*} scopeId 
     */
    _getScope: function (scopeId) {
        var self = this;

        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'MID Server not defined';
            request.setMIDServer(self.settings.midServerName);
        }

        request.setEndpoint(self.settings.cicdServerExportURL.concat('/sys_scope/', scopeId));
        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Content-Type", "application/json");
        request.setHttpMethod('GET');

        //self.console.log('Settings {0}', JSON.stringify(self.settings));
        //self.console.log('CommitId {0}', commitId);
        //self.console.log("URL: {0}", request.getEndpoint());

        var response = request.execute(); // Async somehow does not perform
        if (!response.haveError()) {
            try {
                var responseJson = JSON.parse(response.getBody());
                //self.console.log("successful - result is: {0}", JSON.stringify(responseJson));
                return responseJson;

            } catch (e) {
                self.console.error("JSON parsing failed. Text: {0}, Error:", response.getBody(), e);
                throw e;
            }
        } else {
            var statusCode = response.getStatusCode();
            self.console.error("request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}", statusCode, response.getErrorMessage(), request.getEndpoint(), response.getBody());
            throw new Error(response.getErrorMessage());
        }
    },

    /**
     * check for required roles
     * 'admin' or 'cicd_integration_user'
     *      in addition, to access the SOAP api it requires the 'soap_query' and 'soap_script' role
     */
    checkAccess: function () {
        if (gs.getUser().getRoles().contains('admin'))
            return;

        if (!gs.getUser().getRoles().contains('cicd_integration_user'))
            throw Error('User Not Authorized');

    },

    /**
     * Proxy for hub.do. Call local host with same param and credentials.
     * /api/devops/cicd/source/hub.do
     * 
     * @param {*} request 
     * @param {*} response 
     */
    getHubStatus: function (request, response) {

        if ('hub.do' == request.pathParams.page) {
            try {
                gs.info('[CICD] export : hub.do status');
                var rest = new sn_ws.RESTMessageV2();
                rest.setEndpoint(gs.getProperty('glide.servlet.uri').concat(request.pathParams.page, '?', request.queryString));
                rest.setRequestHeader('Authorization', request.getHeader('Authorization'));
                rest.setHttpMethod('GET');
                rest.setRequestHeader("Accept", "application/json");
                rest.setRequestHeader("Content-Type", "application/json");

                var resp = rest.execute();
                response.setStatus(resp.getStatusCode());
                response.setContentType('application/json');
                if (response.haveError())
                    throw Error(response.getErrorMessage())

                var body = resp.getBody();
                var bObj = JSON.parse(body);
                if (bObj.error)
                    throw Error(body)

                return response.getStreamWriter().writeString(body);
            } catch (e) {
                // hub.do need high privileges, if the current user d
                return response.getStreamWriter().writeString(JSON.stringify({
                    "__comment": "this is not the official hub payload",
                    "com.snc.teamdev.requires_codereview": gs.getProperty('com.snc.teamdev.requires_codereview'),
                    "instance_id": gs.getProperty('instance_id'),
                    "instance_properties": "dunno.zip",
                    "upgrade_system_busy": GlidePluginManager.isUpgradeSystemBusy()
                }));
            }
        }



    },

    /**
     * UpdateSet SOAP Web Service Endpoint
     * /api/devops/cicd/source/sys_update_set
     * 
     * @param {*} requestXml 
     * @param {*} response 
     */
    updateSetSoapWebService: function (requestXml, response) {
        var self = this;

        try {

            this.checkAccess();

            var payload = gs.xmlToJSON(requestXml);
            var body = payload['SOAP-ENV:Envelope']['SOAP-ENV:Body'];
            var funcName = Object.keys(body)[0];

            //self.console.log('soapWebService ' + funcName + " --- XML " + requestXml);

            var query = body[funcName]['__encoded_query'];
            var commitId = null;
            var count = 0;
            if (query) {
                var match = query.match(/^sys_idIN(.*)$/i);
                if (match && match[1]) {
                    commitId = match[1];
                    count = 1;
                }
            }

            var resp = new XMLDocument("<" + funcName + "Response/>");

            if ('getKeys' == funcName) {

                resp.createElement("count", count);
                resp.createElement("sys_id", commitId);

            } else if ('getRecords' == funcName) {

                resp.createElement("count", count);
                var result = resp.createElement("getRecordsResult");
                resp.setCurrent(result);

                var head = self.assign({
                    application: null,
                    application_name: null,
                    application_scope: null,
                    application_version: null,

                    base_update_set: null,
                    completed_by: null,
                    completed_on: null,
                    description: null,
                    installed_from: null,
                    install_date: null,
                    is_default: null,
                    merged_to: null,
                    name: null,
                    origin_sys_id: null,
                    parent: null,
                    release_date: null,
                    remote_sys_id: null,
                    state: null,
                    sys_created_by: null,
                    sys_created_on: null,
                    sys_id: null,
                    sys_mod_count: null,
                    sys_updated_by: null,
                    sys_updated_on: null
                }, self._getUpdateSet(commitId))
                //self.console.log('getUpdateSet {0}', JSON.stringify(head));

                self._preference.set(head.sys_id, commitId)

                // create the XML payload
                Object.keys(head).forEach(function (name) {
                    if (head[name])
                        resp.createElement(name, head[name]);
                    if (!name.startsWith('dv_') && !head['dv_' + name])
                        resp.createElement('dv_' + name, head[name]);
                });

            }

            //self.console.log('getUpdateSet XML ' + resp.toIndentedString());
            response.soapResponseElement = resp.getDocumentElement();
            return;

        } catch (e) {
            self.console.error('updateSetSoapWebService ' + e);
            response.e = e;
        }

    },

    /**
     * guess what: split an array into chunks
     */
    _chunkArray: function (myArray, chunk_size) {
        var index = 0, arrayLength = myArray.length, tempArray = [];
        for (index = 0; index < arrayLength; index += chunk_size) {
            tempArray.push(myArray.slice(index, index + chunk_size));
        }
        return tempArray;
    },

    /**
     * temp preference store. 
     * as service now does not use the same session in the remote update set client, the sys_id information must be stored elsewhere.
     */
    _preference: {
        get: function (name) {
            if (!name)
                return;

            var gr = new GlideRecord('sys_user_preference');
            gr.addQuery('user', gs.getUserID());
            gr.addQuery('name', name);
            gr._query();
            if (gr._next()) {
                return gr.getValue('value');
            }
        },
        set: function (name, value) {
            if (!name)
                return;

            var gr = new GlideRecord('sys_user_preference');
            gr.addQuery('user', gs.getUserID());
            gr.addQuery('name', name);
            gr._query();
            if (gr._next()) {
                gr.setValue('value', value);
                return gr.update();
            } else {
                gr.initialize();
                gr.setValue('user', gs.getUserID());
                gr.setValue('name', name);
                gr.setValue('type', 'string');
                gr.setValue('value', value);
                return gr.insert();
            }
        },
        del: function (name) {
            if (!name)
                return;

            var gr = new GlideRecord('sys_user_preference');
            gr.addQuery('user', gs.getUserID());
            gr.addQuery('name', name);
            gr._query();
            if (gr._next()) {
                return gr.deleteRecord();
            }
        }
    },

    /**
     * UpdateSet XML SOAP Web Service Endpoint
     * /api/devops/cicd/source/sys_properties
     * 
     * @param {*} requestXml 
     * @param {*} response 
     */
    instanceIdWebService: function (requestXml, response) {
        var self = this;

        try {

            this.checkAccess();

            var payload = gs.xmlToJSON(requestXml);
            var body = payload['SOAP-ENV:Envelope']['SOAP-ENV:Body'];
            var funcName = Object.keys(body)[0];

            var resp = new XMLDocument("<" + funcName + "Response/>");


            if ('getKeys' == funcName) {

                var gr = new GlideRecord('sys_properties');
                if (gr.get('name', 'instance_id')) {
                    resp.createElement("count", 1);
                    resp.createElement("sys_id", gr.getValue('sys_id'));
                } else {
                    throw Error('property not found');
                }

            } else if ('getRecords' == funcName) {


                resp.createElement("count", 1);
                var result = resp.createElement("getRecordsResult");
                resp.setCurrent(result);

                var gr = new GlideRecord('sys_properties');
                if (gr.get('name', 'instance_id')) {
                    Object.keys(gr).forEach(function (fieldName) {
                        fieldName = fieldName.trim();

                        if (!gr.isValidField(fieldName.split('.')[0]))
                            return;
                        resp.createElement(fieldName, gr.getValue(fieldName));
                    })
                }
            }


            //self.console.log('getUpdateSet XML ' + resp.toIndentedString());
            response.soapResponseElement = resp.getDocumentElement();
            return;
        } catch (e) {
            self.console.error('sysScopeSoapWebService ' + e);
            response.e = e;
        }
    },

    /**
     * UpdateSet XML SOAP Web Service Endpoint
     * /api/devops/cicd/source/sys_scope
     * 
     * @param {*} requestXml 
     * @param {*} response 
     */
    sysScopeSoapWebService: function (requestXml, response) {
        var self = this;

        try {

            this.checkAccess();

            var payload = gs.xmlToJSON(requestXml);
            var body = payload['SOAP-ENV:Envelope']['SOAP-ENV:Body'];

            var funcName = Object.keys(body)[0];
            var scopeSysId = null;

            var resp = new XMLDocument("<" + funcName + "Response/>");


            if ('getKeys' == funcName) {
                scopeSysId = body['getKeys']['sys_id'];
                resp.createElement("count", 1);
                resp.createElement("sys_id", scopeSysId);

            } else if ('getRecords' == funcName) {
                var query = body['getRecords']['__encoded_query'];
                scopeSysId = null;

                if (query) {
                    var match = query.match(/^sys_idIN(.*)$/i);
                    if (match && match[1]) {
                        scopeSysId = match[1];
                    }
                }
                if (!scopeSysId)
                    throw "No sys_id found in query";

                resp.createElement("count", 1);
                var result = resp.createElement("getRecordsResult");
                resp.setCurrent(result);

                var head = self.assign({
                    active: 1,
                    can_edit_in_studio: 1,
                    enforce_license: 'log',
                    js_level: 'helsinki_es5',
                    licensable: 0,
                    license_category: undefined,
                    license_model: 'none',
                    logo: undefined,
                    name: 'Scope Name',
                    'private': 0,
                    restrict_table_access: 0,
                    runtime_access_tracking: 'permissive',
                    scope: 'scope_name',
                    scoped_administration: 0,
                    short_description: undefined,
                    source: 'scope_name',
                    sys_class_name: 'sys_app',
                    sys_created_by: 'admin',
                    sys_created_on: '2015-05-18 00:00:00',
                    sys_id: '000000000000000000000000000000',
                    sys_mod_count: 0,
                    sys_updated_by: 'system',
                    sys_updated_on: '2015-05-18 00:00:00',
                    template: undefined,
                    trackable: 1,
                    vendor: undefined,
                    vendor_prefix: undefined,
                    version: '1.0.0'
                }, self._getScope(scopeSysId))
                //self.console.log('getUpdateSet {0}', JSON.stringify(head));

                // create the XML payload
                Object.keys(head).forEach(function (name) {
                    if (head[name])
                        resp.createElement(name, head[name]);
                    /*
                    if (!name.startsWith('dv_') && !head['dv_' + name])
                        resp.createElement('dv_' + name, head[name]);
                    */
                });

            }


            //self.console.log('getUpdateSet XML ' + resp.toIndentedString());
            response.soapResponseElement = resp.getDocumentElement();
            return;
        } catch (e) {
            self.console.error('sysScopeSoapWebService ' + e);
            response.e = e;
        }
    },

    /**
     * UpdateSet XML SOAP Web Service Endpoint
     * /api/devops/cicd/source/sys_update_xml
     * 
     * @param {*} requestXml 
     * @param {*} response 
     */
    updateSetXmlSoapWebService: function (requestXml, response) {
        var self = this;
        try {

            this.checkAccess();

            var payload = gs.xmlToJSON(requestXml);
            var body = payload['SOAP-ENV:Envelope']['SOAP-ENV:Body'];

            var funcName = Object.keys(body)[0];


            if ('getKeys' == funcName) {
                var sysId = body['getKeys']['update_set'];
                var commitId = self._preference.get(sysId);
                self._preference.del(sysId);

                var aggregate = self._getUpdateSetXmlCount(commitId);
                /*
                    as the update-set sysId (commitId) is not sent to the XML api we 
                    have to keep it. unfortunately the client is not session aware, so put it into user prop..
                */
                self._chunkArray(aggregate.sys_id.split(','), 250).forEach(function (page, index) {
                    var md5 = new GlideChecksum(page.join(',')).getMD5();
                    self._preference.set(md5, commitId);
                    //self.console.log('SAVE TO SESSION:  - md5: ' + md5 + ' sysId: ' + commitId);
                });

                var resp = new XMLDocument("<" + funcName + "Response/>");
                resp.createElement("count", aggregate.count);
                resp.createElement("sys_id", aggregate.sys_id);
                response.soapResponseElement = resp.getDocumentElement();
                return;

            } else if ('getRecords' == funcName) {

                var body = body['getRecords'];
                var query = body['__encoded_query'];
                var xmlSysIds = null;
                if (query) {
                    var match = query.match(/^sys_idIN(.*)$/i);
                    if (match && match[1]) {
                        xmlSysIds = match[1];
                    }
                }
                if (!xmlSysIds)
                    throw "No sys_id found in query";

                /*
                    get the commitId form the user prefs and delete it later.
                */
                var md5 = new GlideChecksum(xmlSysIds).getMD5();
                var commitId = self._preference.get(md5);

                self._preference.del(md5);

                //self.console.log("GET FROM SESSION. md5 " + md5 + ", sysid: " + commitId);
                //self.console.log("update-set sysId " + commitId);
                //self.console.log('XML QUERY ' + JSON.stringify(body));

                var resp = new XMLDocument("<" + funcName + "Response>" + self._getUpdateSetXml(commitId, xmlSysIds) + "</" + funcName + "Response>");
                response.soapResponseElement = resp.getDocumentElement();
                return;
            }

        } catch (e) {
            self.console.error('updateSetXmlSoapWebService ' + e);
            response.e = e;
        }
    },

    /**
     * Connect to CICD Server and get the aggregate information about the update-set-xml records
     *  
     * @param {} commitId
     */
    _getUpdateSetXmlCount: function (commitId) {
        var self = this;

        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'MID Server not defined';
            request.setMIDServer(self.settings.midServerName);
        }

        //self.console.log('Settings {0}', JSON.stringify(self.settings));
        //self.console.log('commitId {0}', commitId);

        request.setEndpoint(self.settings.cicdServerExportURL.concat('/xml_count/', commitId));
        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Content-Type", "application/json");
        request.setHttpMethod('GET');


        var response = request.execute(); // Async somehow does not perform
        if (!response.haveError()) {
            try {
                var responseJson = JSON.parse(response.getBody());
                //self.console.log("successful - result is: {0}", JSON.stringify(responseJson));
                return responseJson;

            } catch (e) {
                self.console.error("JSON parsing failed. Text: {0}, Error:", response.getBody(), e);
                throw e;
            }
        } else {
            var statusCode = response.getStatusCode();
            self.console.error("request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}", statusCode, response.getErrorMessage(), request.getEndpoint(), response.getBody());
            throw new Error(response.getErrorMessage());
        }
    },

    /**
     * Connect to CICD Server and get the update-set-xml records
     *  
     * @param {} sysId 
    */
    _getUpdateSetXml: function (commitId, xmlSysIds) {
        var self = this;

        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'MID Server not defined';
            request.setMIDServer(self.settings.midServerName);
        }

        //self.console.log('Settings {0}', JSON.stringify(self.settings));
        //self.console.log('commitId {0}', commitId);

        request.setEndpoint(self.settings.cicdServerExportURL.concat('/xml/'));
        request.setRequestHeader("Accept", "application/json");
        request.setRequestHeader("Content-Type", "application/json");
        request.setHttpMethod('POST');

        var body = {
            commitId: commitId,
            xmlSysIds: xmlSysIds
        };
        request.setRequestBody(JSON.stringify(body));

        var response = request.execute(); // Async somehow does not perform
        if (!response.haveError()) {
            try {
                var responseXML = response.getBody();
                //self.console.log("successful - result is: {0}", responseXML);
                return responseXML;

            } catch (e) {
                self.console.error("JSON parsing failed. Text: {0}, Error:", response.getBody(), e);
                throw e;
            }
        } else {
            var statusCode = response.getStatusCode();
            self.console.error("request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}", statusCode, response.getErrorMessage(), request.getEndpoint(), JSON.stringify(body));
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

    type: 'CiCdSource'
};
