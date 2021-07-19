/* exported CiCdSource */

/**
 * CDCD Trigger to execute run in CICD Server
 * 
 * @class 
 * @author Boris Moers
 * @requires sn_ws.module:sys_script_include.RESTMessageV2
 * @requires global.module:sys_script_include.XMLDocument
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
 
        var cicdServerMatch = gs.getProperty('cicd-integration.server.url', '').match(/((?:http[s]?:\/\/)[^/]*)/i);
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
      * 
      * @param {*} commitId
      * @returns {undefined}
      */
    _getUpdateSet: function (commitId) {
        var self = this;
 
        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'no running MID server available';
            request.setMIDServer(self.settings.midServerName);
        }
 
        request.setEndpoint(self.settings.cicdServerExportURL.concat('/update_set/', commitId));
        request.setRequestHeader('Accept', 'application/json');
        request.setRequestHeader('Content-Type', 'application/json');
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
                self.console.error('JSON parsing failed. Text: {0}, Error:', response.getBody(), e);
                throw e;
            }
        } else {
            var statusCode = response.getStatusCode();
            self.console.error('request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}', statusCode, response.getErrorMessage(), request.getEndpoint(), response.getBody());
            throw Error(response.getErrorMessage());
        }
    },
 
    /**
      * proxy request to CICD server to get Scope details
      * 
      * @param {*} scopeId
      * @returns {undefined}
      */
    _getScope: function (scopeId) {
        var self = this;
 
        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'no running MID server available';
            request.setMIDServer(self.settings.midServerName);
        }
 
        request.setEndpoint(self.settings.cicdServerExportURL.concat('/sys_scope/', scopeId));
        request.setRequestHeader('Accept', 'application/json');
        request.setRequestHeader('Content-Type', 'application/json');
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
                self.console.error('JSON parsing failed. Text: {0}, Error:', response.getBody(), e);
                throw e;
            }
        } else {
            var statusCode = response.getStatusCode();
            self.console.error('request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}', statusCode, response.getErrorMessage(), request.getEndpoint(), response.getBody());
            throw Error(response.getErrorMessage());
        }
    },
 
    /**
      * check for required roles
      * 'admin' or 'cicd_integration_user'
      * in addition, to access the SOAP api it requires the 'soap_query' and 'soap_script' role
      * @returns {undefined}
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
      * @returns {undefined}
      */
    getHubStatus: function (request, response) {
 
        if ('hub.do' == request.pathParams.page) {
            try {
                gs.info('[CICD] export : hub.do status');
                var rest = new sn_ws.RESTMessageV2();
                rest.setEndpoint(gs.getProperty('glide.servlet.uri').concat(request.pathParams.page, '?', request.queryString));
                rest.setRequestHeader('Authorization', request.getHeader('Authorization'));
                rest.setHttpMethod('GET');
                rest.setRequestHeader('Accept', 'application/json');
                rest.setRequestHeader('Content-Type', 'application/json');
 
                var resp = rest.execute();
                response.setStatus(resp.getStatusCode());
                response.setContentType('application/json');
                if (response.haveError())
                    throw Error(response.getErrorMessage());
 
                var body = resp.getBody();
                var bObj = JSON.parse(body);
                if (bObj.error)
                    throw Error(body);
 
                return response.getStreamWriter().writeString(body);
            } catch (e) {
                // hub.do need high privileges, if the current user d
                return response.getStreamWriter().writeString(JSON.stringify({
                    '__comment': 'this is not the official hub payload',
                    'com.snc.teamdev.requires_codereview': gs.getProperty('com.snc.teamdev.requires_codereview'),
                    'instance_id': gs.getProperty('instance_id'),
                    'instance_properties': gs.getProperty('mid.buildstamp', 'dunno').concat('.zip'),
                    'upgrade_system_busy': GlidePluginManager.isUpgradeSystemBusy()
                }));
            }
        }
 
    },
 
    /**
      * UpdateSet REST Web Service Endpoint for POST messages
      * 
      * On some environments, SOAP request to the scripted 'source' SOAP API (like /api/devops/cicd/source/sys_update_xml.do?SOAP)
      * are routed to the REST API. The REST processor has in this case a higher priority.
      * To avoid update set deployment failure, this REST API exposes the same functionality via REST.
      * 
      * POST: /api/devops/cicd/source/*
      * 
      * @param {*} request
      * @param {*} response
      * @returns {undefined}
      */
    restPostWrapper: function (request, response) {
        var self = this;
 
        try {
            self.checkAccess();
 
            var page = request.pathParams.page;
 
            var requestBody = request.body;
            var requestXml = requestBody ? (requestBody.dataString || '').trim() : '';
 
            var envelope = '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:cicd="http://schemas.moers.swiss/soap/cicd" cicd:rest="true"><SOAP-ENV:Body></SOAP-ENV:Body></SOAP-ENV:Envelope>';
            response.setContentType('text/xml');
 
            var writer = response.getStreamWriter();
 
            switch (page) {
            case 'sys_properties.do':
                response.setStatus(200);
                writer.writeString(self.sysPropertiesWS(requestXml, envelope).toString());
                break;
 
            case 'sys_scope.do':
                response.setStatus(200);
                writer.writeString(self.sysScopeWS(requestXml, envelope).toString());
                break;
 
            case 'sys_update_set.do':
                response.setStatus(200);
                writer.writeString(self.updateSetWS(requestXml, envelope).toString());
                break;
 
            case 'sys_update_xml.do':
                response.setStatus(200);
                writer.writeString(self.updateSetXmlWS(requestXml, envelope).toString());
                break;
 
            default:
                response.setStatus(404);
                break;
            }
        } catch (e) {
            self.console.error('restPostWrapper ' + e);
            //response.setError(new sn_ws_err.BadRequestError(e));
            throw e;
        }
    },
 
    /**
      * UpdateSet Web Service
      * 
      * @param {*} requestXml
      * @param {*} envelope
      * @returns {any} resp
      */
    updateSetWS: function (requestXml, envelope) {
        var self = this;
 
        var payload = gs.xmlToJSON(requestXml);
        var body = payload['SOAP-ENV:Envelope']['SOAP-ENV:Body'];
        var funcName = Object.keys(body)[0];
 
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
 
        var resp = (function () {
            if (envelope) {
                var env = new XMLDocument(envelope);
                env.setCurrent(env.getElementByTagName('SOAP-ENV:Body'));
                env.setCurrent(env.createElement(funcName + 'Response'));
                return env;
            } else {
                return new XMLDocument('<' + funcName + 'Response/>');
            }
        })();
 
        if ('getKeys' == funcName) {
 
            resp.createElement('count', count);
            resp.createElement('sys_id', commitId);
 
        } else if ('getRecords' == funcName) {
 
            resp.createElement('count', count);
            var result = resp.createElement('getRecordsResult');
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
            }, self._getUpdateSet(commitId));
            //self.console.log('getUpdateSet {0}', JSON.stringify(head));
 
            self._preference.set(head.sys_id, commitId);
 
            // create the XML payload
            Object.keys(head).forEach(function (name) {
                if (head[name])
                    resp.createElement(name, head[name]);
                if (!name.startsWith('dv_') && !head['dv_' + name])
                    resp.createElement('dv_' + name, head[name]);
            });
 
        }
 
        //self.console.log('getUpdateSet XML ' + resp.toIndentedString());
        return resp;
    },
 
    /**
      * UpdateSet SOAP Web Service Endpoint
      * /api/devops/cicd/source/sys_update_set
      * 
      * @param {*} requestXml
      * @param {*} response
      * @returns {undefined}
      */
    updateSetSoapWebService: function (requestXml, response) {
        var self = this;
        try {
            self.checkAccess();
            response.soapResponseElement = self.updateSetWS(requestXml).getDocumentElement();
        } catch (e) {
            self.console.error('updateSetSoapWebService ' + e);
            response.e = e;
        }
    },
 
    /**
      * guess what: split an array into chunks
      * 
      * @param {any} myArray
      * @param {any} chunk_size
      * @returns {any} tempArray
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
        /**
          * Description
          * 
          * @param {any} name
          * @returns {undefined}
          */
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
        /**
          * Description
          * 
          * @param {any} name
          * @param {any} value
          * @returns {undefined}
          */
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
        /**
          * Description
          * 
          * @param {any} name
          * @returns {undefined}
          */
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
      * SysProperties Web Service
      * 
      * @param {*} requestXml
      * @param {*} envelope
      * @returns {any} resp
      */
    sysPropertiesWS: function (requestXml, envelope) {
        var payload = gs.xmlToJSON(requestXml);
        var body = payload['SOAP-ENV:Envelope']['SOAP-ENV:Body'];
        var funcName = Object.keys(body)[0];
 
 
        var resp = (function () {
            if (envelope) {
                var env = new XMLDocument(envelope);
                env.setCurrent(env.getElementByTagName('SOAP-ENV:Body'));
                env.setCurrent(env.createElement(funcName + 'Response'));
                return env;
            } else {
                return new XMLDocument('<' + funcName + 'Response/>');
            }
        })();
 
        var gr;
        if ('getKeys' == funcName) {
 
            gr = new GlideRecord('sys_properties');
            if (gr.get('name', 'instance_id')) {
                resp.createElement('count', 1);
                resp.createElement('sys_id', gr.getValue('sys_id'));
            } else {
                throw Error('property not found');
            }
 
        } else if ('getRecords' == funcName) {
 
            resp.createElement('count', 1);
            var result = resp.createElement('getRecordsResult');
            resp.setCurrent(result);
 
            gr = new GlideRecord('sys_properties');
            if (gr.get('name', 'instance_id')) {
                Object.keys(gr).forEach(function (fieldName) {
                    fieldName = fieldName.trim();
 
                    if (!gr.isValidField(fieldName.split('.')[0]))
                        return;
                    resp.createElement(fieldName, gr.getValue(fieldName));
                });
            }
        }
 
        //self.console.log('getUpdateSet XML ' + resp.toIndentedString());
        return resp;
 
    },
 
    /**
      * SysProperties SOAP Web Service Endpoint
      * /api/devops/cicd/source/sys_properties
      * 
      * @param {*} requestXml
      * @param {*} response
      * @returns {undefined}
      */
    instanceIdWebService: function (requestXml, response) {
        var self = this;
        try {
            self.checkAccess();
            response.soapResponseElement = self.sysPropertiesWS(requestXml).getDocumentElement();
        } catch (e) {
            self.console.error('sysPropertiesWS ' + e);
            response.e = e;
        }
    },
 
 
    /**
      * SysScope Web Service
      * 
      * @param {*} requestXml
      * @param {*} envelope
      * @returns {any} resp
      */
    sysScopeWS: function (requestXml, envelope) {
        var self = this;
 
        var payload = gs.xmlToJSON(requestXml);
        var body = payload['SOAP-ENV:Envelope']['SOAP-ENV:Body'];
 
        var funcName = Object.keys(body)[0];
        var scopeSysId = null;
 
        var resp = (function () {
            if (envelope) {
                var env = new XMLDocument(envelope);
                env.setCurrent(env.getElementByTagName('SOAP-ENV:Body'));
                env.setCurrent(env.createElement(funcName + 'Response'));
                return env;
            } else {
                return new XMLDocument('<' + funcName + 'Response/>');
            }
        })();
 
        if ('getKeys' == funcName) {
            scopeSysId = body['getKeys']['sys_id'];
            resp.createElement('count', 1);
            resp.createElement('sys_id', scopeSysId);
 
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
                throw 'No sys_id found in query';
 
            resp.createElement('count', 1);
            var result = resp.createElement('getRecordsResult');
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
            }, self._getScope(scopeSysId));
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
        return resp;
    },
 
    /**
      * SysScope SOAP Web Service Endpoint
      * /api/devops/cicd/source/sys_scope
      * 
      * @param {*} requestXml
      * @param {*} response
      * @returns {undefined}
      */
    sysScopeSoapWebService: function (requestXml, response) {
        var self = this;
        try {
            self.checkAccess();
            response.soapResponseElement = self.sysScopeWS(requestXml).getDocumentElement();
        } catch (e) {
            self.console.error('sysScopeWS ' + e);
            response.e = e;
        }
    },
 
 
    /**
      * UpdateSetXml Web Service
      * 
      * @param {*} requestXml
      * @param {*} envelope
      * @returns {any} resp
      */
    updateSetXmlWS: function (requestXml, envelope) {
        var self = this;
 
 
        var payload = gs.xmlToJSON(requestXml);
        var body = payload['SOAP-ENV:Envelope']['SOAP-ENV:Body'];
 
        var funcName = Object.keys(body)[0];
        var commitId;
        var resp = (function () {
            if (envelope) {
                var env = new XMLDocument(envelope);
                env.setCurrent(env.getElementByTagName('SOAP-ENV:Body'));
                env.setCurrent(env.createElement(funcName + 'Response'));
                return env;
            } else {
                return new XMLDocument('<' + funcName + 'Response/>');
            }
        })();
 
        if ('getKeys' == funcName) {
            var sysId = body['getKeys']['update_set'];
            commitId = self._preference.get(sysId);
            self._preference.del(sysId);
 
            var aggregate = self._getUpdateSetXmlCount(commitId);
            /*
                 as the update-set sysId (commitId) is not sent to the XML api we 
                 have to keep it. unfortunately the client is not session aware, so put it into user prop..
             */
            self._chunkArray(aggregate.sys_id.split(','), 250).forEach(function (page) {
                var md5 = new GlideChecksum(page.join(',')).getMD5();
                self._preference.set(md5, commitId);
                //self.console.log('SAVE TO SESSION:  - md5: ' + md5 + ' sysId: ' + commitId);
            });
 
 
            resp.createElement('count', aggregate.count);
            resp.createElement('sys_id', aggregate.sys_id);
 
        } else if ('getRecords' == funcName) {
 
            body = body['getRecords'];
            var query = body['__encoded_query'];
            var xmlSysIds = null;
            if (query) {
                var match = query.match(/^sys_idIN(.*)$/i);
                if (match && match[1]) {
                    xmlSysIds = match[1];
                }
            }
            if (!xmlSysIds)
                throw 'No sys_id found in query';
 
            /*
                 get the commitId form the user prefs and delete it later.
             */
            var md5 = new GlideChecksum(xmlSysIds).getMD5();
            commitId = self._preference.get(md5);
 
            self._preference.del(md5);
 
            //self.console.log("GET FROM SESSION. md5 " + md5 + ", sysid: " + commitId);
            //self.console.log("update-set sysId " + commitId);
            //self.console.log('XML QUERY ' + JSON.stringify(body));
 
            //resp = new XMLDocument("<" + funcName + "Response>" + self._getUpdateSetXml(commitId, xmlSysIds) + "</" + funcName + "Response>");
            if (envelope) {
                resp = new XMLDocument(envelope.replace('<SOAP-ENV:Body></SOAP-ENV:Body>', '<SOAP-ENV:Body><' + funcName + 'Response>' + self._getUpdateSetXml(commitId, xmlSysIds) + '</' + funcName + 'Response></SOAP-ENV:Body>'));
            } else {
                resp = new XMLDocument('<' + funcName + 'Response>' + self._getUpdateSetXml(commitId, xmlSysIds) + '</' + funcName + 'Response>');
            }
        }
 
        //self.console.log('updateSetXmlWS ' + resp.toIndentedString());
        return resp;
 
    },
 
 
    /**
      * UpdateSet XML SOAP Web Service Endpoint
      * /api/devops/cicd/source/sys_update_xml
      * 
      * @param {*} requestXml
      * @param {*} response
      * @returns {undefined}
      */
    updateSetXmlSoapWebService: function (requestXml, response) {
        var self = this;
        try {
            self.checkAccess();
            response.soapResponseElement = self.updateSetXmlWS(requestXml).getDocumentElement();
        } catch (e) {
            self.console.error('updateSetXmlSoapWebService ' + e);
            response.e = e;
        }
    },
 
 
    /**
      * Connect to CICD Server and get the aggregate information about the update-set-xml records
      * 
      * @param {} commitId
      * @returns {undefined}
      */
    _getUpdateSetXmlCount: function (commitId) {
        var self = this;
 
        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'no running MID server available';
            request.setMIDServer(self.settings.midServerName);
        }
 
        //self.console.log('Settings {0}', JSON.stringify(self.settings));
        //self.console.log('commitId {0}', commitId);
 
        request.setEndpoint(self.settings.cicdServerExportURL.concat('/xml_count/', commitId));
        request.setRequestHeader('Accept', 'application/json');
        request.setRequestHeader('Content-Type', 'application/json');
        request.setHttpMethod('GET');
 
 
        var response = request.execute(); // Async somehow does not perform
        if (!response.haveError()) {
            try {
                var responseJson = JSON.parse(response.getBody());
                //self.console.log("successful - result is: {0}", JSON.stringify(responseJson));
                return responseJson;
 
            } catch (e) {
                self.console.error('JSON parsing failed. Text: {0}, Error:', response.getBody(), e);
                throw e;
            }
        } else {
            var statusCode = response.getStatusCode();
            self.console.error('request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}', statusCode, response.getErrorMessage(), request.getEndpoint(), response.getBody());
            throw Error(response.getErrorMessage());
        }
    },
 
    /**
      * Connect to CICD Server and get the update-set-xml records
      * 
      * @param {} commitId
      * @param {any} xmlSysIds
      * @returns {undefined}
      */
    _getUpdateSetXml: function (commitId, xmlSysIds) {
        var self = this;
 
        var request = new sn_ws.RESTMessageV2();
        if (self.settings.throughMidServer) {
            if (gs.nil(self.settings.midServerName))
                throw 'no running MID server available';
            request.setMIDServer(self.settings.midServerName);
        }
 
        //self.console.log('Settings {0}', JSON.stringify(self.settings));
        //self.console.log('commitId {0}', commitId);
 
        request.setEndpoint(self.settings.cicdServerExportURL.concat('/xml/'));
        request.setRequestHeader('Accept', 'application/json');
        request.setRequestHeader('Content-Type', 'application/json');
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
                self.console.error('JSON parsing failed. Text: {0}, Error:', response.getBody(), e);
                throw e;
            }
        } else {
            var statusCode = response.getStatusCode();
            self.console.error('request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}', statusCode, response.getErrorMessage(), request.getEndpoint(), JSON.stringify(body));
            throw Error(response.getErrorMessage());
        }
    },
 
    /**
      * Aggregate Rest Worker. Called by CiCdDeploy()._aggregateUpdateSet()
      * 
      * @param {*} payload the payload used in the deployment
      * @returns {undefined}
      */
    aggregateUpdateSetWorker: function (payload) {
        var self = this;
 
        self.console.log('aggregateUpdateSetWorker: {0}', JSON.stringify(payload));
 
        if (!payload)
            throw Error('payload not specified');
 
        var tracker = SNC.GlideExecutionTracker.getLastRunning();
        //tracker.setSourceTable();
        tracker.setMaxProgressValue(10);
        tracker.run();
         
        var retry = true;
        var maxTry = 10;
        var tryCount = 0;
         
        try {
 
            var commitId = Array.isArray(payload.limitSet) ? payload.limitSet[0] : payload.limitSet;
            if (!commitId)
                throw Error('payload.limitSet (commitId) not specified');
 
            if (self.settings.throughMidServer && gs.nil(self.settings.midServerName)) {
                throw Error('no running MID server available');
            }
 
            var endpoint = self.settings.cicdServerExportURL.concat('/xml_count/', commitId);
 
            var request = new sn_ws.RESTMessageV2();
            if (self.settings.throughMidServer) {
                request.setMIDServer(self.settings.midServerName);
            }
 
            request.setEndpoint(endpoint);
            request.setRequestHeader('Accept', 'application/json');
            request.setRequestHeader('Content-Type', 'application/json');
            request.setHttpMethod('GET');
 
            var response = request.execute();
 
            while (retry) {
 
                tryCount++;
                if (tryCount >= maxTry) {
                    retry = false;
                }
 
                tracker.incrementProgressValue();
 
                try {
                    if (!response.haveError()) {
                        try {
                            var responseJson = JSON.parse(response.getBody());
                            tracker.updateResult({ count: responseJson.count });
                            tracker.updateProgressValue(10);
                            tracker.success('Export success');
                            break;
 
                        } catch (e) {
                            retry = false;
                            throw gs.getMessage('JSON parsing failed. Text: {0}, Error: {1}', [response.getBody(), e]);
                        }
                    } else {
                        var statusCode = response.getStatusCode();
                        retry = false;
                        throw gs.getMessage('Request ended in error - StatusCode {0}, ResponseMessage: {1}, Endpoint: {2}, RequestBody: {3}', [statusCode, response.getErrorMessage(), request.getEndpoint(), response.getBody()]);
                    }
                } catch (e) {
 
                    // retry on ECCResponseTimeoutException issues
                    if (!e.toString().includes('ECCResponseTimeoutException')) {
                        throw e;
                    }
                    if (!retry) {
                        self.console.error(gs.getMessage('aggregateUpdateSetWorker: Request failed after {0} retry to URL: \'{1}\'', [tryCount.toString(), endpoint]));
                        throw e;
                    }
 
                    self.console.error(gs.getMessage('aggregateUpdateSetWorker: ECCResponseTimeoutException, going to retry ({0}) the request to URL: \'{0}\'', [tryCount.toString(), endpoint]));
                    self.console.error(e);
                }
            }
 
        } catch (e) {
 
            tracker.fail(gs.getMessage('Tracker Error: {0}', [e]));
            self.console.error(e);
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
        mid.addQuery('validated', 'true');
        mid.setLimit(1);
        mid.query();
        if (mid._next()) {
            name = mid.name.toString();
        }
        return name;
    },
 
    type: 'CiCdSource'
};
 