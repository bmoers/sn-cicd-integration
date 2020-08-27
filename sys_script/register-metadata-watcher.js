/** 
 * Business Rule on sys_metadata_link
 * Every time a new record is created a business rule is installed to track the record.
 * Updates on the original record are automatically applied to the sys_metadata_link one.
 * 
 * - AFTER
 * - on: INSERT, DELETE
*/
(function (current) {

    var sysId = current.getValue('documentkey');
    var scope = current.getValue('sys_scope');
    var tableName = current.getValue('tablename');
    var condition = 'sys_id=' + sysId;
    var script = "// Update Metadata Link if the related record changes.\n" +
        "// delete this business rule if the metadata link record is deleted \n" +
        " \n" +
        "(function (current) { \n" +
        "        var operation = current.operation(); \n" +
        "        if (operation == 'insert') \n" +
        "            return; \n" +
        " \n" +
        "        if (!(!current.isMetadata() && current.canCreate() && !SNC.MetadataLinkUtil.isTableMetadataLinkExempt(current.getTableName()))) \n" +
        "            return; \n" +
        " \n" +
        "        var cgrSysId = current.getValue('sys_id'); \n" +
        "        if (!cgrSysId) \n" +
        "            return; \n" +
        " \n" +
        "        var output = new GlideRecord('sys_metadata_link'); \n" +
        "        output.addQuery('documentkey', cgrSysId); \n" +
        "        output.addQuery('sys_scope', gs.getCurrentApplicationId()); \n" +
        "        output.addQuery('tablename', current.getTableName()); \n" +
        "        output.query(); \n" +
        "        if (output.next()) { \n" +
        "            if (output.getRowCount() > 1) \n" +
        "                return gs.addInfoMessage('Multiple sys_metadata_link records found. Please update the correct one manually.'); \n" +
        " \n" +
        "            if (operation == 'update') { \n" +
        "                output.payload = gs.unloadRecordToXML(current, true); \n" +
        "                output.sys_name = current.getDisplayValue(); \n" +
        "                output.update(); \n" +
        "                return gs.addInfoMessage('Related sys_metadata_link successfully updated'); \n" +
        "            } else { \n" +
        "                output.deleteRecord(); \n" +
        "                return gs.addInfoMessage('Related sys_metadata_link successfully deleted'); \n" +
        "            } \n" +
        "        } \n" +
        "})(current); ";

    var br = new GlideRecord('sys_script');
    br.addQuery('collection', tableName);
    br.addQuery('filter_condition', condition);
    br.addQuery('when', 'after');
    br.addQuery('action_update', true);
    br.addQuery('action_delete', true);
    br.addQuery('order', '676');
    br.query();
    if (current.operation() == 'insert') {
        if (br.next())
            return;

        br.collection = tableName;
        br.filter_condition = condition;
        br.when = 'after';
        br.action_update = true;
        br.action_delete = true;
        br.order = 676;
        br.name = 'SnapWatch:' + sysId;
        br.script = script;
        br.insert();
    } else if (current.operation() == 'delete') {
        if (br.next())
            br.deleteRecord();
    }

})(current);
