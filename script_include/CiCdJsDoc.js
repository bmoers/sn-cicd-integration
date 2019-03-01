
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

        if (!GlideProperties.getBoolean('cicd-integration.jsdocButton.enabled', false))
            return false;

        // dont show the jsDoc button if record is readonly or protected
        if (current.isValidField('sys_policy')) {
            if (['read', 'protected'].indexOf(current.getValue('sys_policy')) !== -1) {
                return false;
            }
        }
        return true;
    },

    type: 'CiCdJsDoc'
};