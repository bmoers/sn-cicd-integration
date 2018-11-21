/* exported CiCdAtf */
/* global sn_atf, gs, GlideChecksum, GlideXMLDocument, sn_ws, sn_ws_err, Class, TestExecutorAjax, GlideRecord, GlideProperties, JSON */


/**
 * Class Description
 * 
 * @class 
 * @author Boris Moers
 * @requires sn_ws_err.module:sys_script_include.BadRequestError
 * @requires global.module:sys_script_include.TestExecutorAjax
 * @memberof global.module:sys_script_include
 */
var CiCdAtf = Class.create();

CiCdAtf.prototype = /** @lends global.module:sys_script_include.CiCdAtf.prototype */ {

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

    },

    /**
     * Get param from URL path
     * 
     * @param {any} paramName
     * @param {any} callback
     * @returns {undefined}
     */
    getPathParam: function (paramName, callback) {
        var self = this,
            out = (paramName in self.request.pathParams) ? self.request.pathParams[paramName] : null;

        if (self.isFunction(callback)) {
            return callback(out);
        } else {
            return out;
        }
    },

    /**
     * Get param form URL query argument
     * 
     * @param {any} paramName
     * @param {any} callback
     * @returns {undefined}
     */
    getQueryParam: function (paramName, callback) {
        var self = this,
            out = (paramName in self.request.queryParams) ? (function () {
                var value = self.request.queryParams[paramName];
                if (Array.isArray(value)) {
                    return (value.length === 1) ? value[0] : value;
                } else {
                    return value;
                }
            })() : null;

        if (self.isFunction(callback)) {
            return callback(out);
        } else {
            return out;
        }
    },


    /**
     * Get the testrunner from the current user.
     * This requires the testrunner window to be opened in a browser first.
     * 
     * @returns {any} testRunnerSessionId
     */
    getTestRunnerSessionId: function (runnerId) {
        var testRunnerSessionId = null;

        var existingRunner = new GlideRecord("sys_atf_agent");
        existingRunner.addQuery("status", "online");
        existingRunner.addQuery("type", "manual");
        existingRunner.addQuery("user_agent", "CONTAINS", runnerId);
        // existingRunner.addQuery("session_id", new GlideChecksum(gs.getSessionID()).getMD5());
        // otherSessionRunner.addQuery("session_id","!=", new GlideChecksum(gs.getSessionID()).getMD5());
        // existingRunner.addQuery("user", gs.getUserID());
        existingRunner.setLimit(1);
        existingRunner._query();
        if (existingRunner._next()) {
            testRunnerSessionId = existingRunner.getValue('session_id');
        }
        return testRunnerSessionId;
    },


    /**
     * Execute a Test-Suite<br>
     * 
     * mapped to POST /api/devops/v1/cicd/atf/suite
     * @returns {any} out
     */
    executeSuite: function () {
        var self = this,
            suiteId,
            runnerId,
            out = {
                executionId: null
            },
            need_browser = false,
            testRunnerSessionId = null;

        var requestBody = self.request.body;
        if (!requestBody || !requestBody.hasNext())
            return new sn_ws_err.BadRequestError('initialize: no body found');

        var body = requestBody.nextEntry();
        suiteId = body.id || null;
        if (gs.nil(suiteId))
            return new sn_ws_err.BadRequestError('initialize: suiteId property not found');

        runnerId = body.runnerId || null;
        if (gs.nil(runnerId))
            return new sn_ws_err.BadRequestError('initialize: runnerId property not found');
        
        var gr = new GlideRecord('sys_atf_test_suite');
        if (!gr.get(suiteId)) {
            return new sn_ws_err.BadRequestError("Could not find the Test suite with id: " + suiteId);
        }

        out.url = gs.getProperty('glide.servlet.uri').concat(gr.getLink(true));
        out.name = gr.getDisplayValue();

        need_browser = sn_atf.AutomatedTestingFramework.doesSuiteHaveUITests(suiteId);
        if (need_browser) {
            testRunnerSessionId = self.getTestRunnerSessionId(runnerId);
            if (gs.nil(testRunnerSessionId)) {
                return new sn_ws_err.BadRequestError("This TestSuite requires an active Test Runner to be available.");
            }
        }

        // execute suite
        out.executionId = new TestExecutorAjax((function () {
            var params = {
                'sysparm_name': 'true',
                'sysparm_ajax_processor_ut_test_suite_id': suiteId,
                'sysparm_ajax_processor_test_runner_session_id': testRunnerSessionId
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

        /*
        var executor = new sn_atf.UserTestSuiteExecutor();
        executor.setTestSuiteSysId(suiteId);
        executor.setTestRunnerSessionId(testRunnerSessionId);
        out.executionId = executor.start();
        */
        return out;
    },

    /**
     * Tet Test-Suite results<br>
     * 
     * mapped to GET /api/devops/v1/cicd/atf/suite/{id}
     * @returns {any} out
     */
    getSuiteResults: function () {
        var self = this,
            out = {
                testResults: []
            };

        var suiteId = self.getPathParam('suiteId');

        var gr = new GlideRecord('sys_atf_test_suite_result');
        if (gr.get(suiteId)) {
            out.number = gr.getValue('number');
            out.status = gr.getValue('status');
            out.duration = gr.getValue('run_time');
            out.url = gs.getProperty('glide.servlet.uri').concat(gr.getLink(true));
            out.type = 'test_suite_result';

            var gRes = new GlideRecord('sys_atf_test_result');
            gRes.addQuery('parent', gr.getValue('sys_id'));
            gRes._query();
            while (gRes._next()) {
                out.testResults.push(self._getTestResultDetails(gRes.getValue('sys_id')));
            }
        }
        return out;
    },


    /**
     * Execute a single Test<br>
     * mapped to POST /api/devops/v1/cicd/atf/test
     * @returns {any} out
     */
    executeTest: function () {
        var self = this,
            testId,
            runnerId,
            out = {
                executionId: null
            },
            need_browser = false,
            testRunnerSessionId = null;

        var requestBody = self.request.body;
        if (!requestBody || !requestBody.hasNext())
            return new sn_ws_err.BadRequestError('initialize: no body found');

        var body = requestBody.nextEntry();
        testId = body.id || null;
        if (gs.nil(testId))
            return new sn_ws_err.BadRequestError('initialize: testId property not found' + JSON.stringify(body));

        runnerId = body.runnerId || null;
        if (gs.nil(runnerId))
            return new sn_ws_err.BadRequestError('initialize: runnerId property not found');
        
        var gr = new GlideRecord('sys_atf_test');
        if (!gr.get(testId)) {
            return new sn_ws_err.BadRequestError("Could not find the Test suite with id: " + testId);
        }

        out.url = gs.getProperty('glide.servlet.uri').concat(gr.getLink(true));
        out.name = gr.getDisplayValue();

        need_browser = sn_atf.AutomatedTestingFramework.doesTestHaveUISteps(testId);
        if (need_browser) {
            testRunnerSessionId = self.getTestRunnerSessionId(runnerId);
            if (gs.nil(testRunnerSessionId)) {
                return new sn_ws_err.BadRequestError("This Test requires an active Test Runner to be available.");
            }
        }

        // execute test
        out.executionId = new TestExecutorAjax((function () {
            var params = {
                'sysparm_ajax_processor_ut_test_id': testId,
                'sysparm_ajax_processor_test_runner_session_id': testRunnerSessionId
            };
            return {
                /**
                 * Description
                 * 
                 * @param {any} name
                 * @returns {MemberExpression}
                 */
                getParameter: function name(name) {
                    return params[name];
                }
            };
        })(), new GlideXMLDocument(), '').process();

        return out;
    },


    /**
     * Get Single Test Results<br>
     * mapped to GET /api/devops/v1/cicd/atf/test/{id}
     * @returns {any}
     */
    getTestResults: function () {
        var self = this;

        var testId = self.getPathParam('testId');

        return self._getTestResultDetails(testId);

    },

    /**
     * Get the execution state of a test run<br>
     * mapped to GET /api/devops/v1/cicd/atf/track/{id}
     * @returns {any}
     */
    getExecutionTrackerState: function () {
        var self = this;
        var id = self.getPathParam('executionId');
        var gr = new GlideRecord('sys_execution_tracker');
        gr.get(id);

        return {
            state: {
                value: gr.getValue('state'),
                display_value: gr.getDisplayValue('state')
            },
            result: {
                value: gr.getValue('result'),
                display_value: gr.getDisplayValue('result')
            },
            url: gs.getProperty('glide.servlet.uri').concat(gr.getLink(true))
        };

    },

    /**
     * convert test result to object
     * 
     * @param {any} sysId
     * @returns {any} out
     */
    _getTestResultDetails: function (sysId) {
        var self = this,
            out = {
                stepResults: []
            };

        var gr = new GlideRecord('sys_atf_test_result');
        if (gr.get(sysId)) {

            out.number = gr.getDisplayValue('test');
            out.status = gr.getValue('status');
            out.startTime = gr.getValue('start_time');
            out.endTime = gr.getValue('end_time');
            out.duration = gr.getValue('run_time');
            out.output = gr.getValue('output');
            out.type = 'test_result';
            out.url = gs.getProperty('glide.servlet.uri').concat(gr.getLink(true));

            var gRes = new GlideRecord('sys_atf_test_result_step');
            gRes.addQuery('test_result', gr.getValue('sys_id'));
            gRes.orderBy('step.order');
            gRes._query();
            while (gRes._next()) {
                out.stepResults.push({
                    order: parseInt(gRes.getElement('step.order').toString(), 10),
                    startTime: gRes.getValue('start_time'),
                    step: gRes.getDisplayValue('step'),
                    status: gRes.getValue('status'),
                    summary: gRes.getValue('summary'),
                    url: gs.getProperty('glide.servlet.uri').concat(gRes.getLink(true))
                });
            }
        }
        return out;
    },

    type: 'CiCdAtf'
};