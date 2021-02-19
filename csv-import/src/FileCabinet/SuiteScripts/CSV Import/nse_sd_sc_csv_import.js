/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 * @NAmdConfig /SuiteScripts/CSV Import/csv_import_configuration.json
 *
 * @author Selcuk Dogru
 * _nse_sc_csv_import
 *
 * @description Based on the deployment mapping setting, finds script deployments that are not scheduled and assigns to CSV Import Queue records.
 */
define(['N/search', 'N/task', 'N/record', 'nseLib'],
    (search, task, record, nseLib) => {
        const SCRIPT_PARAMS = {
            deployMap: 'custscript_nse_sc_csv_import_deploy_map'
        };

        /**
         * @function execute
         * @description Pushes pending CSV Import Queue records to available Map/Reduce Script deployments.
         *
         * @param {object} context - Script context
         * @return null
         */
        let execute = (context) => {
            let scriptParams = nseLib.getScriptParams(SCRIPT_PARAMS);
            let deploymentMapping = JSON.parse(scriptParams.deployMap);
            let importQueue = nseLib.getImportQueueRecords({taskStatus: 1});
            let usedDeployments = getActiveScriptInstances('customscript_nse_mr_csv_import');

            for (let subsidiaryId in importQueue) {
                let subsidiaryDeployments = nseLib.isEmpty(deploymentMapping[subsidiaryId]) ? deploymentMapping[0] : deploymentMapping[subsidiaryId];
                for (let sd in subsidiaryDeployments) {
                    if (!usedDeployments.includes(subsidiaryDeployments[sd])) {
                        let importTaskDetails = importQueue[subsidiaryId].shift();
                        let mrTask = task.create({
                            taskType: task.TaskType.MAP_REDUCE,
                            scriptId: 'customscript_nse_mr_csv_import',
                            deploymentId: subsidiaryDeployments[sd],
                            params: {
                                custscript_nse_mr_csv_import_fileid: importTaskDetails.fileId,
                                custscript_nse_mr_csv_import_sub: subsidiaryId,
                                custscript_nse_mr_csv_import_user: importTaskDetails.userId
                            }
                        });
                        let mrTaskId = mrTask.submit();
                        usedDeployments.push(subsidiaryDeployments[sd]);
                        record.submitFields({
                            type: 'customrecord_nse_csv_import_queue',
                            id: importTaskDetails.internalId,
                            values: {
                                custrecord_nse_csv_import_status: 2,
                                custrecord_nse_csv_import_task_id: mrTaskId
                            }
                        });
                    }
                    if (importQueue[subsidiaryId].length === 0)
                        break;
                }
            }
        }

        /**
         * @function getActiveScriptInstances
         * @description Finds script deployment instances that are not available.
         *
         * @param {string} scriptId - Script ID of the script record
         * @return {array} - Array of Script IDs of the deployment records
         */
        let getActiveScriptInstances = (scriptId) => {
            let activeDeployments = [];
            let ssiSearchObject = search.create({
                type: search.Type.SCHEDULED_SCRIPT_INSTANCE,
                filters:
                    [
                        ['script.scriptid', 'is', scriptId], 'AND',
                        ['status', 'anyof', ["PENDING", "PROCESSING", "RESTART", "RETRY"]]
                    ],
                columns:
                    ['scriptDeployment.scriptid', 'status', 'taskid']
            });
            ssiSearchObject.run().each(function (ssiSearchResult) {
                let deploymentId = ssiSearchResult.getValue({
                    name: 'scriptid', join: 'scriptDeployment'
                });
                activeDeployments.push(deploymentId.toLowerCase());
                return true;
            });

            return activeDeployments;
        }

        return {
            execute: execute
        }

    });
