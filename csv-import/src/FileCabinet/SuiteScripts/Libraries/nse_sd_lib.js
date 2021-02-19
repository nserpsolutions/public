/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @author Selcuk Dogru
 *
 */
define(['N/runtime', 'N/task', 'N/search'],
    (runtime, task, search) => {

        /**
         * @function initiateQueueScheduler
         * @description Initiates CSV Import Queue scheduler.
         *
         * @return {string} - Task ID of the submitted Scheduled Script.
         */
        let initiateQueueScheduler = () => {
            let scheduledScriptTask = task.create({
                taskType: task.TaskType.SCHEDULED_SCRIPT,
                scriptId: 'customscript_nse_sc_csv_import',
                deploymentId: 'customdeploy_nse_sc_csv_import'
            });

            return scheduledScriptTask.submit();
        }

        /**
         * @function getImportQueueRecords
         * @description Finds CSV Import Queue records based on options.
         *
         * @param {object} options - Search options.
         * @return {object} - CSV Import Queue records grouped per subsidiary.
         */
        let getImportQueueRecords = (options) => {
            let importQueueData = {};
            let searchFilters = [];
            searchFilters.push(!isEmpty(options.fileId) ? ['custrecord_nse_csv_import_file_id', 'equalto', options.fileId] : ['custrecord_nse_csv_import_status', 'anyof', [options.taskStatus]]);

            let csvImportQueueSearch = search.create({
                type: 'customrecord_nse_csv_import_queue',
                filters: searchFilters,
                columns: ['custrecord_nse_csv_import_file_id', 'custrecord_nse_csv_import_user', 'custrecord_nse_csv_import_subsidiary']
            });
            csvImportQueueSearch.run().each((ciqSearchResult) => {
                let subsidiaryId = parseInt(ciqSearchResult.getValue({name: 'custrecord_nse_csv_import_subsidiary'}));
                if(isEmpty(importQueueData[subsidiaryId]))
                    importQueueData[subsidiaryId] = [];
                    importQueueData[subsidiaryId].push({
                        internalId: parseInt(ciqSearchResult.id),
                        fileId: parseInt(ciqSearchResult.getValue({name: 'custrecord_nse_csv_import_file_id'})),
                        userId: parseInt(ciqSearchResult.getValue({name: 'custrecord_nse_csv_import_user'}))
                    });

                return true;
            });

            return importQueueData;
        }

         /**
         * @function isEmpty
         * @description Checks if given parameter holds a value, or not.
         *
         * @param {object} value - Parameter to be checked
         * @return {boolean}
         */
        let isEmpty = (value) => {
            if (value === undefined || value === null)
                return true;
            if (util.isNumber(value) || util.isBoolean(value) || util.isDate(value) || util.isFunction(value))
                return false;
            if (util.isString(value))
                return (value.length === 0);
            return (Object.keys(value).length === 0);
        }

        /**
         * @function getScriptParams
         * @description Retrieves the script parameter values
         *
         * @param {object} params - Name / Script ID pair of the parameters
         * @return {object} - Name / Value pair of the parameters
         */
        let getScriptParams = (params) => {
            let scriptObject = runtime.getCurrentScript();
            let returnData = {};

            for (let s in params) {
                returnData[s] = scriptObject.getParameter({
                    name: params[s]
                });
            }

            return returnData;
        }

        return {
            initiateQueueScheduler: initiateQueueScheduler,
            getImportQueueRecords: getImportQueueRecords,
            isEmpty: isEmpty,
            getScriptParams: getScriptParams
        };
});
