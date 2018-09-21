/**
 * Various API to prevent CICD process direct connecting to table API
 * 
 * @class 
 * @author Boris Moers
 * @requires sn_ws_err.module:sys_script_include.NotFoundError
 * @memberof global.module:sys_script_include
 */
var CiCdApi = Class.create();

CiCdApi.prototype = /** @lends global.module:sys_script_include.CiCdApi.prototype */ {

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
        }
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
     * Get User information by userId
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
     * Get the details of an UpdateSet
     *
     * @param {String} updateSetSysId
     * @returns {any} the updateset details
     */
    getUpdateSetDetails: function (updateSetSysId) {
        var self = this;

        return self._getGrResultStream('sys_update_set', updateSetSysId, {});
    },

    /**
     * Get the details of an UpdateSet
     *
     * @param {String} updateSetSysId
     * @returns {any} the updateset details
     */
    getUpdateSetFiles: function (updateSetSysId) {
        var self = this;

        return self._getGrResultStream('sys_update_xml', null, {
            sysparm_limit: 50,
            sysparm_query: 'update_set.base_update_set=' + updateSetSysId + '^ORupdate_set=' + updateSetSysId + '^ORDERBYsys_recorded_at'
        });

    },


    /**
     * Get all ATF Test which are assigned to a TestSuite. <br>
     * This is used to exclude the test from the ATF runs to avoid running twice.
     * 
     * @returns {any} all test assigned to a test suite
     */
    getAllTestInSuites: function () {
        var self = this;
        return self._getGrResultStream('sys_atf_test_suite_test', null, {
            sysparm_query: 'test_suite.active=true^test.active=true',
            sysparm_fields: 'test'
        });
    },


    getFilesFromTable: function (tableName) {
        var self = this,
            rootTable = null;

        if ('sys_metadata' != tableName) {
            var extendsSyMeta = new TableUtils(tableName).getHierarchy().toArray().some(function (table) {
                return ('sys_metadata' == table);
            });
            if (!extendsSyMeta)
                return new sn_ws_err.NotFoundError('No Record found.' + tabHir + ' - ' + tabHir[tabHir.length - 1] + '- ' + tabHir.length);
        }
        return self._getGrResultStream(tableName, null, {});
    },


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


    _createLink: function (limit, offset, rel) {
        var self = this;
        var queryParams = Object.keys(self.request.queryParams).reduce(function (prev, key) {
            if (['sysparm_limit', 'sysparm_offset'].indexOf(key) === -1) {
                return prev.concat( [key.concat('=', encodeURIComponent( self.getQueryParam(key) ))] );
            }
            return prev;
        }, []);
        return '<'.concat(self.request.url, '?', queryParams.concat(['sysparm_limit=' + limit, 'sysparm_offset=' + offset]).join('&'), ';rel="', rel, '">');
    },

    _getGrResultStream: function (tableName, sysId, defaultParams) {
    
        var self = this;

        defaultParams = defaultParams || {};
        var singleObject = (sysId);
        if (singleObject) {
            defaultParams.sysparm_suppress_pagination_header = 'true';
        }

        var query = defaultParams.sysparm_query || self.getQueryParam('sysparm_query');
        var fields = defaultParams.sysparm_fields || self.getQueryParam('sysparm_fields');
        fields = (fields) ? fields.split(',') : [];

        var offset = parseInt(self.getQueryParam('sysparm_offset', 0), 10);
        var limit  = parseInt(self.getQueryParam('sysparm_limit', defaultParams.sysparm_limit || 10000));

        var displayValue = self.getQueryParam('sysparm_display_value', 'false');
        var category = self.getQueryParam('sysparm_query_category');
    
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
            return new sn_ws_err.NotFoundError('No Record found. Query: '.concat(query));
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
            writer.writeString(JSON.stringify(out));
        
        }
        if (!singleObject) {
            writer.writeString(']');
        }
    
        if (self.getQueryParam('sysparm_meta', false)) {
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


    type: 'CiCdApi'
};