module.exports = {
    'env': {
        'es6': true,
        'node': true
    },
    'extends': 'eslint:recommended',
    'parserOptions': {
        'ecmaVersion': 2015
    },
    'globals': {
        '$': 'readonly',
        '$j': 'readonly',
        action: 'readonly',
        angular: 'readonly',
        Class: 'readonly',
        current: 'readonly',
        g_document: 'readonly',
        g_form: 'readonly',
        g_i18n: 'readonly',
        g_list: 'readonly',
        g_navigation: 'readonly',
        gel: 'readonly',
        GlideAction: 'readonly',
        GlideAggregate: 'readonly',
        GlideAjax: 'readonly',
        GlideChecksum: 'readonly',
        GlideDateTime: 'readonly',
        GlideDialogWindow: 'readonly',
        GlideEncrypter: 'readonly',
        GlideFilter: 'readonly',
        GlideModal: 'readonly',
        GlidePluginManager: 'readonly',
        GlidePreviewProblemAction: 'readonly',
        GlidePreviewProblemHandler: 'readonly',
        GlideProperties: 'readonly',
        GlideRecord: 'readonly',
        GlideRecordSimpleSerializer: 'readonly',
        GlideScriptedHierarchicalWorker: 'readonly',
        GlideSecureRandomUtil: 'readonly',
        GlideStringUtil: 'readonly',
        GlideTableHierarchy: 'readonly',
        GlideUpdateSet: 'readonly',
        GlideUpdateManager2: 'readonly',
        GlideUpdateSetWorker: 'readonly',
        GlideXMLDocument: 'readonly',
        gs: 'readonly',
        GwtMessage: 'readonly',
        HierarchyUpdateSetPreviewAjax: 'readonly',
        jQuery: 'readonly',
        JSUtil: 'readonly',
        JSON: 'readonly',
        Packages: 'readonly',
        parent: 'readonly',
        previous: 'readonly',
        request: 'readonly',
        response: 'readonly',
        SncAuthentication: 'readonly',
        sn_atf: 'readonly',
        g_scratchpad: 'readonly',
        sn_ws: 'readonly',
        sn_ws_err: 'readonly',
        SNC: 'readonly',
        TableUtils: 'readonly',
        TestExecutorAjax: 'readonly',
        UpdateSetCommitAjax: 'readonly',
        UpdateSetExport: 'readonly',
        UpdateSetPreviewAjax: 'readonly',
        XMLDocument: 'readonly',

    },
    'rules': {
        'indent': [
            'error',
            4
        ],
        'no-console': 'off',
        'no-unused-vars': 'warn',
        'linebreak-style': [
            'warn',
            'unix'
        ],
        'quotes': [
            'warn',
            'single'
        ],
        'semi': [
            'error',
            'always'
        ],
        'no-use-before-define': [
            'error', { 'functions': true, 'classes': true }
        ]
    }
};
