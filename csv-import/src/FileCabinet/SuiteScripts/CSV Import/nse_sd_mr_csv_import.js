/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @NAmdConfig /SuiteScripts/CSV Import/csv_import_configuration.json
 *
 * @author Selcuk Dogru
 * _nse_mr_csv_import
 *
 * @description Based on the script parameters, processes the CSV file and notifies user about the outcome.
 */
define(['N/cache', 'N/currency', 'N/email', 'N/error', 'N/file', 'N/format', 'N/record', 'N/runtime', 'N/search', 'nseLib', 'papaparse'],
    (cache, currency, email, error, file, format, record, runtime, search, nseLib, Papa) => {
        const RESERVED_KEYS = ['recType', 'defaultValues', 'lineMapping', 'lineId'];
        const EMAIL_AUTHOR_ID = -5;
        const ERROR_FILE_NAME = 'csv_import_errors.csv';
        const CACHE_DETAILS = {
            name: '236e41105efcb76877ea5366a475158f573b7575a14e06283729a26ed3e8c5d5',
            periodKey: 'b4558708e6706d063135062653bf63ce128a8a3ac6daa3cc3ae714966097bfa8',
            permissionKey: 'c45686a8e67d6d074135c63653cf60cb128a6a3ac6dab3cb3ae714265087bfa1'
        };
        const SCRIPT_PARAMS = {
            fileId: 'custscript_nse_mr_csv_import_fileid',
            mapping: 'custscript_nse_mr_csv_import_map',
            options: 'custscript_nse_mr_csv_import_option',
            user: 'custscript_nse_mr_csv_import_user',
            subsidiary: 'custscript_nse_mr_csv_import_sub'
        };

        /**
         * @function getInputData
         * @description Parses the CSV file and creates cache that stores employee permissions.
         *
         * @returns {array} - Parsed CSV file
         */
        let getInputData = () => {
            let scriptParams = nseLib.getScriptParams(SCRIPT_PARAMS);
            let options = JSON.parse(scriptParams.options);
            let csvFile = file.load({
                id: parseInt(scriptParams.fileId)
            });
            let parsedData = Papa.parse(csvFile.getContents(), {
                header: true,
                delimiter: options.csvDelimiter,
                skipEmptyLines: 'greedy'
            });
            let csvFileParseErrors = '';

            for (let e in parsedData.errors) {
                csvFileParseErrors += parsedData.errors[e].row + ',' + parsedData.errors[e].message + '\n';
            }

            if (!nseLib.isEmpty(csvFileParseErrors)) {
                throw error.create({
                    name: 'NSE_CSV_PRS_ERR',
                    message: csvFileParseErrors,
                    notifyOff: true
                });
            }

            let lpCache = cache.getCache({
                name: CACHE_DETAILS.name,
                scope: cache.Scope.PRIVATE
            });
            lpCache.put({
                key: CACHE_DETAILS.permissionKey,
                value: getEmployeeCreatePermissions(scriptParams.user, scriptParams.subsidiary)
            });

            if (!options.postToLockedPeriod) {
                lpCache.put({
                    key: CACHE_DETAILS.periodKey,
                    value: getLockedPeriods()
                });
            }

            return parsedData.data;
        }

        /**
         * @function map
         * @description Matches the CSV line with the related record mapping. Prepares object to be processed as a NetSuite record.
         *
         * @param context
         * @returns null
         */
        let map = (context) => {
            let lineData = JSON.parse(context.value);
            log.debug('lineData', lineData);
            let recordMapping = getRecordMapping(lineData.Type);
            log.debug('recordMapping', recordMapping);
            if (nseLib.isEmpty(recordMapping))
                throw error.create({
                    name: 'NSE_CSV_IMP_NO_REC_MAP',
                    message: 'No record mapping found for record type ' + lineData.Type,
                    notifyOff: true
                });

            let recordData = {
                type: recordMapping.recType
            };

            for (let key in recordMapping) {
                if (!RESERVED_KEYS.includes(key)) {
                    if (!nseLib.isEmpty(lineData[key]))
                        recordData[recordMapping[key]] = lineData[key];
                } else if (key === RESERVED_KEYS[2]) {
                    recordData.lines = {
                        sublistId: recordMapping[key].lineId
                    };
                    for (let lineKey in recordMapping[key]) {
                        if (!RESERVED_KEYS.includes(lineKey)) {
                            if (!nseLib.isEmpty(lineData[lineKey]))
                                recordData.lines[recordMapping[key][lineKey]] = lineData[lineKey];
                        } else if (lineKey === RESERVED_KEYS[1]) {
                            for (let defaultLineKey in recordMapping[key][lineKey]) {
                                if (!nseLib.isEmpty(recordMapping[key][lineKey][defaultLineKey]))
                                    recordData.lines[defaultLineKey] = recordMapping[key][lineKey][defaultLineKey];
                            }
                        }
                    }
                } else if (key === RESERVED_KEYS[1]) {
                    for (let defaultKey in recordMapping[key]) {
                        if (!nseLib.isEmpty(recordMapping[key][defaultKey]))
                            recordData[defaultKey] = recordMapping[key][defaultKey];
                    }
                }
            }
            log.debug('recordData', recordData);

            context.write(recordData.externalid, recordData);
        }

        /**
         * @function reduce
         * @description Processes the JSON record data and creates NetSuite record based on the options. User triggered the process must have permission to create the record.
         *
         * @param context
         * @returns null
         */
        let reduce = (context) => {
            let scriptParams = nseLib.getScriptParams(SCRIPT_PARAMS);
            let recordChecks = {
                checkApplySublist: false,
                transactionApplied: false
            };
            let options = JSON.parse(scriptParams.options);

            let recordObject = {
                lines: []
            };
            for (let v in context.values) {
                let recordData = JSON.parse(context.values[v]);
                for (let key in recordData) {
                    if (key !== 'lines') {
                        recordObject[key] = recordData[key];
                    }
                }
                if (!nseLib.isEmpty(recordData.lines))
                    recordObject.lines.push(recordData.lines);
            }

            let lpCache = cache.getCache({
                name: CACHE_DETAILS.name,
                scope: cache.Scope.PRIVATE
            });
            let userCreatePermissions = JSON.parse(lpCache.get({
                key: CACHE_DETAILS.permissionKey,
                loader: getEmployeeCreatePermissions(scriptParams.user, scriptParams.subsidiary)
            }));

            if (!userCreatePermissions.includes(options.permissionMap[recordObject.type]))
                throw error.create({
                    name: 'NSE_REC_PERM_ERR',
                    message: 'Your assigned roles do not allow you to create this type of transactions.',
                    notifyOff: true
                });

            if ([record.Type.CUSTOMER_PAYMENT, record.Type.VENDOR_PAYMENT].includes(recordObject.type))
                recordChecks.checkApplySublist = true;

            let nsRecord = record.create({
                type: record.Type[recordObject.type],
                isDynamic: true
            });

            setBodyFields(recordObject, nsRecord, options, recordChecks);
            setLineFields(recordObject, nsRecord, options, recordChecks);

            let subsidiaryId = parseInt(scriptParams.subsidiary);
            let nsRecordSubsidiaryId;
            let nsRecordSubsidiary = nsRecord.getValue({fieldId: 'subsidiary'});
            if (util.isArray(nsRecordSubsidiary)) {
                if (nsRecordSubsidiary.length === 1)
                    nsRecordSubsidiaryId = parseInt(nsRecordSubsidiary[0]);
            } else {
                nsRecordSubsidiaryId = parseInt(nsRecordSubsidiary);
            }

            if (!nseLib.isEmpty(subsidiaryId) && nsRecordSubsidiaryId !== subsidiaryId) {
                throw error.create({
                    name: 'NSE_WRG_SUB_ERR',
                    message: 'Script was not initiated for the subsidiary of this record.',
                    notifyOff: true
                });
            }

            if (!options.setExternalId) {
                nsRecord.setValue({
                    fieldId: 'externalid',
                    value: null
                });
            }

            if (!options.postToLockedPeriod) {
                setPostingPeriod(nsRecord, lpCache);
            }

            let recordId = nsRecord.save();

            if (recordChecks.checkApplySublist && !recordChecks.transactionApplied) {
                context.write({
                    key: recordObject.externalid,
                    value: 'Payment record ' + recordId + 'created but not applied to any transaction.'
                });
            } else {
                context.write({
                    key: recordObject.externalid,
                    value: 'SUCCESS'
                });
            }
        }

        /**
         * @function summarize
         * @description Removes cached data. Prepares and sends informational email to the user triggered the process. Updates related CSV Import Queue record.
         *
         * @param summary
         * @returns null
         */
        let summarize = (summary) => {
            let scriptParams = nseLib.getScriptParams(SCRIPT_PARAMS);
            let userId = scriptParams.user;
            let importQueueRecordDetails = nseLib.getImportQueueRecords({fileId: scriptParams.fileId})[scriptParams.subsidiary][0];
            let lpCache = cache.getCache({
                name: CACHE_DETAILS.name,
                scope: cache.Scope.PRIVATE
            });
            lpCache.remove({
                key: CACHE_DETAILS.periodKey
            });
            lpCache.remove({
                key: CACHE_DETAILS.permissionKey
            });
            let recordCounts = {
                success: 0,
                warning: 0,
                error: 0,
                mapError: 0
            };

            if (!nseLib.isEmpty(summary.inputSummary.error)) {
                record.submitFields({
                    type: 'customrecord_nse_csv_import_queue',
                    id: importQueueRecordDetails.internalId,
                    values: {
                        custrecord_nse_csv_import_status: 4
                    }
                });
                let inputErrorDetails = JSON.parse(summary.inputSummary.error);
                let inputErrorMessageDetails = {};
                try {
                    inputErrorMessageDetails = JSON.parse(inputErrorDetails.message);
                } catch (err) {

                }
                email.send({
                    author: EMAIL_AUTHOR_ID,
                    recipients: [userId],
                    subject: 'Error While Processing Uploaded CSV File',
                    body: 'Hello,\n\n' +
                        'An error occurred while parsing the uploaded CSV file (File ID: ' + scriptParams.fileId + '). ' +
                        'Please find the details below.\n' +
                        'You will need to upload the related file again after correcting.\n\n' +
                        'Error Code: ' + inputErrorDetails.name + '\n' +
                        'Error Message: ' + inputErrorMessageDetails.message + '\n\n' +
                        'Regards,\n' +
                        'NetSuite Service Desk'
                });

                return null;
            }

            let errorDetails = '';
            summary.mapSummary.errors.iterator().each((key, error) => {
                recordCounts.mapError++;
                let errorObject = JSON.parse(error);
                errorDetails += 'ERROR,' + key + ',' + errorObject.name + ',' + errorObject.message + '\n';
                return true;
            });

            summary.reduceSummary.errors.iterator().each((key, error) => {
                recordCounts.error++;
                let errorObject = JSON.parse(error);

                try {
                    let messageDetails = JSON.parse(errorObject.message);
                    errorDetails += 'ERROR,' + key + ',' + messageDetails.name + ',' + messageDetails.message + '\n';
                } catch (e) {
                    errorDetails += 'ERROR,' + key + ',' + errorObject.name + ',' + errorObject.message + '\n';
                }
                return true;
            });
            summary.output.iterator().each((key, value) => {
                if (value === 'SUCCESS')
                    recordCounts.success++;
                else {
                    recordCounts.warning++
                    errorDetails += 'WARNING,' + key + ',,' + value + '\n';
                }
                return true;
            });

            record.submitFields({
                type: 'customrecord_nse_csv_import_queue',
                id: importQueueRecordDetails.internalId,
                values: {
                    custrecord_nse_csv_import_status: 3,
                    custrecord_nse_csv_import_success_count: recordCounts.success,
                    custrecord_nse_csv_import_warning_count: recordCounts.warning,
                    custrecord_nse_csv_import_error_count: recordCounts.error,
                    custrecord_nse_csv_import_map_errors: recordCounts.mapError
                }
            });

            if (!nseLib.isEmpty(errorDetails)) {
                errorDetails = 'Type,External ID,Code,Details\n' + errorDetails;
                email.send({
                    author: EMAIL_AUTHOR_ID,
                    recipients: [userId],
                    subject: 'CSV File Processing Completed with Errors',
                    body: 'Hello,\n\n' +
                        'An error occurred while processing the CSV file (File ID: ' + scriptParams.fileId + ').' +
                        'Please find the details for the failed lines attached.\n' +
                        'After correcting the CSV file, please upload only the failed lines for processing.\n\n' +
                        'Regards,\n' +
                        'NetSuite Service Desk',
                    attachments: [file.create({
                        name: ERROR_FILE_NAME,
                        fileType: file.Type.CSV,
                        contents: errorDetails
                    })]
                });
            } else {
                email.send({
                    author: EMAIL_AUTHOR_ID,
                    recipients: [userId],
                    subject: 'CSV File Processing Completed Successfully',
                    body: 'Hello,\n\n' +
                        'The CSV file (File ID: ' + scriptParams.fileId + ') was successfully imported. ' +
                        'If you encounter any inconsistency, please contact us.\n\n' +
                        'Regards,\n' +
                        'NetSuite Service Desk'
                });
            }

            nseLib.initiateQueueScheduler();
        }

        /**
         * @function getRecordMapping
         * @description Reads the record mapping from the Script Deployment.
         *
         * @param {string }type - Related mapping type from the CSV line
         * @returns {object} - Record mapping details
         */
        let getRecordMapping = (type) => {
            let currentScript = runtime.getCurrentScript();
            let mappingData = JSON.parse(currentScript.getParameter({
                name: 'custscript_nse_mr_csv_import_map'
            }));

            return mappingData[type];
        }

        /**
         * @function getLockedPeriods
         * @description Queries all open periods and for each open period retrieves locked tasks per subsidiary including the next open posting period.
         *
         * @returns {object} - Details of the locked accounting periods
         */
        let getLockedPeriods = () => {
            let openAccountingPeriods = {};
            let accountingPeriodSearch = search.create({
                type: search.Type.ACCOUNTING_PERIOD,
                filters: [
                    ['closed', search.Operator.IS, false], 'AND',
                    ['isadjust', search.Operator.IS, false], 'AND',
                    ['isinactive', search.Operator.IS, false], 'AND',
                    ['isquarter', search.Operator.IS, false], 'AND',
                    ['isyear', search.Operator.IS, false], 'AND',
                    ['startdate', search.Operator.ONORBEFORE, 'today']
                ],
                columns: ['periodname', 'startdate', 'enddate']
            });

            accountingPeriodSearch.run().each((result) => {
                if (openAccountingPeriods[result.id] === undefined)
                    openAccountingPeriods[result.id] = {
                        periodId: result.id,
                        periodName: result.getValue({name: 'periodname'}),
                        startDate: result.getValue({name: 'startdate'}),
                        endDate: result.getValue({name: 'enddate'})
                    };
                return true;
            });

            let lockedAccountingPeriods = {};
            for (let o in openAccountingPeriods) {
                let taskItemStatusSearch = search.create({
                    type: 'taskitemstatus',
                    filters: [
                        ['period', 'abs', o], 'AND',
                        ['itemtype', 'anyof', ['PCP_LOCK_AR', 'PCP_LOCK_AP', 'PCP_LOCK_ALL']], 'AND',
                        ['complete', 'is', true]
                    ],
                    columns: ['period', 'subsidiary', 'itemtype']
                });

                taskItemStatusSearch.run().each((result) => {
                    let periodId = result.getValue({name: 'period'});
                    let subsidiaryId = result.getValue({name: 'subsidiary'});
                    let lockedItem = result.getValue({name: 'itemtype'});

                    if (lockedAccountingPeriods[periodId] === undefined) {
                        lockedAccountingPeriods[periodId] = {
                            details: openAccountingPeriods[o],
                            nextPeriod: getNextPeriodDetails(format.parse({
                                value: openAccountingPeriods[o].endDate,
                                type: format.Type.DATE
                            }))
                        };
                    }

                    if (lockedAccountingPeriods[periodId][subsidiaryId] === undefined)
                        lockedAccountingPeriods[periodId][subsidiaryId] = {};

                    lockedAccountingPeriods[periodId][subsidiaryId][lockedItem] = true;
                    return true;
                });
            }

            return lockedAccountingPeriods;
        }

        /**
         * @function setBodyFields
         * @description Sets record body field values.
         *
         * @param {object} recObj - Details of the record to be used
         * @param {object} nsRec - NetSuite record that is being created
         * @param {object} recOpt - Options for record processing
         * @param {object} recChecks - Record checks for creating warning messages
         * @returns null
         */
        let setBodyFields = (recObj, nsRec, recOpt, recChecks) => {
            for (let bif in recOpt.bodyInitialFields) {
                if (!nseLib.isEmpty(recObj[recOpt.bodyInitialFields[bif]])) {
                    if (recOpt.textValueFields.includes(recOpt.bodyInitialFields[bif])) {
                        nsRec.setText({
                            fieldId: recOpt.bodyInitialFields[bif],
                            text: recObj[recOpt.bodyInitialFields[bif]]
                        });
                    } else {
                        nsRec.setValue({
                            fieldId: recOpt.bodyInitialFields[bif],
                            value: recObj[recOpt.bodyInitialFields[bif]]
                        });
                    }
                }
            }
            for (let ro in recObj) {
                if (ro !== 'type' && !recOpt.bodyInitialFields.includes(ro)) {
                    if (recOpt.textValueFields.includes(ro)) {
                        nsRec.setText({
                            fieldId: ro,
                            text: recObj[ro]
                        });
                    } else {
                        nsRec.setValue({
                            fieldId: ro,
                            value: recOpt.dateValueFields.includes(ro) ? format.parse({
                                value: recObj[ro],
                                type: format.Type.DATE
                            }) : recObj[ro]
                        });
                    }
                }
            }
        }

        /**
         * @function setLineFields
         * @description Creates record lines and sets line field values.
         *
         * @param {object} recObj - Details of the record to be used
         * @param {object} nsRec - NetSuite record that is being created
         * @param {object} recOpt - Options for record processing
         * @param {object} recChecks - Record checks for creating warning messages
         * @returns null
         */
        let setLineFields = (recObj, nsRec, recOpt, recChecks) => {
            for (let l in recObj.lines) {
                if (!recOpt.applySublists.includes(recObj.lines[l].sublistId)) {
                    nsRec.selectNewLine({
                        sublistId: recObj.lines[l].sublistId
                    });
                    for (let lif in recOpt.lineInitialFields) {
                        if (!nseLib.isEmpty(recObj.lines[l][recOpt.lineInitialFields[lif]])) {
                            if (recOpt.textValueFields.includes(recOpt.lineInitialFields[lif])) {
                                nsRec.setCurrentSublistText({
                                    sublistId: recObj.lines[l].sublistId,
                                    fieldId: recOpt.lineInitialFields[lif],
                                    text: recObj.lines[l][recOpt.lineInitialFields[lif]]
                                });
                            } else {
                                nsRec.setCurrentSublistValue({
                                    sublistId: recObj.lines[l].sublistId,
                                    fieldId: recOpt.lineInitialFields[lif],
                                    value: recObj.lines[l][recOpt.lineInitialFields[lif]]
                                });
                            }
                        }
                    }

                    for (let lo in recObj.lines[l]) {
                        if (lo !== 'sublistId' && !recOpt.lineInitialFields.includes(lo)) {
                            if (recOpt.textValueFields.includes(lo)) {
                                nsRec.setCurrentSublistText({
                                    sublistId: recObj.lines[l].sublistId,
                                    fieldId: lo,
                                    text: recObj.lines[l][lo]
                                });
                            } else {
                                nsRec.setCurrentSublistValue({
                                    sublistId: recObj.lines[l].sublistId,
                                    fieldId: lo,
                                    value: recOpt.dateValueFields.includes(lo) ? format.parse({
                                        value: recObj.lines[l][lo],
                                        type: format.Type.DATE
                                    }) : recObj.lines[l][lo]
                                });
                            }
                        }
                    }

                    nsRec.commitLine({
                        sublistId: recObj.lines[l].sublistId
                    });
                } else {
                    let lineId = -1;
                    if (!nseLib.isEmpty(recObj.lines[l].internalid))
                        lineId = nsRec.findSublistLineWithValue({
                            sublistId: recObj.lines[l].sublistId,
                            fieldId: 'internalid',
                            value: recObj.lines[l].internalid
                        });
                    else
                        lineId = nsRec.findSublistLineWithValue({
                            sublistId: recObj.lines[l].sublistId,
                            fieldId: 'refnum',
                            value: recObj.lines[l].tranid
                        });

                    if (lineId !== -1 && recObj.lines[l].amount > 0) {
                        recChecks.transactionApplied = true;
                        nsRec.selectLine({
                            sublistId: recObj.lines[l].sublistId,
                            line: lineId
                        });
                        nsRec.setCurrentSublistValue({
                            sublistId: recObj.lines[l].sublistId,
                            fieldId: 'amount',
                            value: recObj.lines[l].amount
                        });
                        nsRec.commitLine({
                            sublistId: recObj.lines[l].sublistId
                        });
                    }
                }
            }
        }

        /**
         * @function setPostingPeriod
         * @description Creates record lines and sets line field values.
         *
         * @param {object} nsRec - NetSuite record object that is being created
         * @param {object} lockedPeriodCache - Locked accounting period details from cache
         * @returns null
         */
        let setPostingPeriod = (nsRec, lockedPeriodCache) => {
            let currentPeriodName = nsRec.getText({
                fieldId: 'postingperiod'
            });
            let nsRecordSubsidiaryName = nsRec.getText({
                fieldId: 'subsidiary'
            });
            if (!nseLib.isEmpty(currentPeriodName)) {
                let lockedPeriods = JSON.parse(lockedPeriodCache.get({
                    key: CACHE_DETAILS.periodKey,
                    loader: getLockedPeriods()
                }));
                let newPeriodId = -1;
                while (true) {
                    if (!nseLib.isEmpty(lockedPeriods) && !nseLib.isEmpty(lockedPeriods[currentPeriodName]) && !nseLib.isEmpty(lockedPeriods[currentPeriodName][nsRecordSubsidiaryName])) {
                        if (lockedPeriods[currentPeriodName][nsRecordSubsidiaryName]['Lock All']) {
                            newPeriodId = lockedPeriods[currentPeriodName].nextPeriod.periodId;
                            currentPeriodName = lockedPeriods[currentPeriodName].nextPeriod.periodName;
                        } else
                            break;
                    } else
                        break;
                }

                if (newPeriodId !== -1) {
                    nsRec.setValue({
                        fieldId: 'postingperiod',
                        value: newPeriodId
                    });
                }
            }
        }

        /**
         * @function getNextPeriodDetails
         * @description Finds the next open posting period based on a given date.
         *
         * @param {date} afterDate - Date reference for the search
         * @returns {object} - Details of the accounting period
         */
        let getNextPeriodDetails = (afterDate) => {
            let nextPeriodDetails = {};
            let periodStartDate = format.format({
                value: new Date(afterDate.getTime() + 86400000),
                type: format.Type.DATE
            });

            let accountingPeriodSearch = search.create({
                type: search.Type.ACCOUNTING_PERIOD,
                filters: [
                    ['closed', 'is', false], 'AND',
                    ['isadjust', 'is', false], 'AND',
                    ['isinactive', 'is', false], 'AND',
                    ['isquarter', 'is', false], 'AND',
                    ['isyear', 'is', false], 'AND',
                    ['startdate', 'on', periodStartDate]
                ],
                columns: ['periodname']
            });

            let nextPeriods = accountingPeriodSearch.run().getRange({
                start: 0,
                end: 1
            });

            if (nextPeriods.length > 0)
                nextPeriodDetails = {
                    periodId: nextPeriods[0].id,
                    periodName: nextPeriods[0].getValue({
                        name: 'periodname'
                    })
                };
            return nextPeriodDetails;
        }

        /**
         * @function getEmployeeCreatePermissions
         * @description Retrieves the record create permissions of the employee from assigned roles.
         *
         * @param {number} employeeId - Internal ID of the employee
         * @param {number} subsidiaryId - Internal ID of the subsidiary
         * @returns {object} - Details of the user permissions for the subsidiary
         */
        let getEmployeeCreatePermissions = (employeeId, subsidiaryId) => {
            let permissions = [];
            let searchFilters = [
                ['internalid', search.Operator.ANYOF, employeeId], 'AND',
                ['level', search.Operator.ANYOF, ['2', '3', '4']]
            ];
            if (!nseLib.isEmpty(subsidiaryId)) {
                searchFilters.push('AND');
                searchFilters.push(['role.subsidiaries', search.Operator.ANYOF, [subsidiaryId]]);
            }

            let employeeSearch = search.create({
                type: search.Type.EMPLOYEE,
                filters: searchFilters,
                columns: ['permission']
            });

            employeeSearch.run().each(function (result) {
                permissions.push(result.getValue({
                    name: 'permission'
                }));
                return true;
            });

            return permissions;
        }

        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            summarize: summarize
        };
    });
