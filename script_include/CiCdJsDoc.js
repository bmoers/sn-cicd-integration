/**
 * Helper Class to control visibility of UI action
 * 
 * @class 
 * @author Boris Moers [b.moers]
 * @memberof global.module:sys_script_include
 */
var CiCdJsDoc = Class.create();
CiCdJsDoc.prototype = /** @lends global.module:sys_script_include.CiCdJsDoc.prototype */ {
    /**
     * Constructor
     * 
     * @returns {undefined}
     */
    initialize: function () {
    },

    /**
     * Helper Function to show/hide button
     * 
     * @param {any} current
     * @returns {boolean} 
     */
    showButton: function (current) {
        if (gs.nil(current) || !current.canWrite())
            return false;

        return (gs.getProperty('cicd-integration.jsdocButton.enabled', 'false') == 'true');
    },

    type: 'CiCdJsDoc'
};