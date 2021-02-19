/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @NAmdConfig /SuiteScripts/CSV Import/csv_import_configuration.json
 *
 * @author Selcuk Dogru
 * _nse_sl_csv_import
 *
 * @description Captures the CSV/Spreadsheet file from the user, creates CSV Import Queue records and triggers Scheduled Script for queue processing.
 */
define(['N/error', 'N/file', 'N/https', 'N/runtime', 'N/search', 'N/record', 'N/task', 'N/ui/serverWidget', 'nseLib', 'jszip', 'xlsx'],
    (error, file, https, runtime, search, record, task, serverWidget, nseLib, JSZIP, XLSX) => {
        const CSV_PARENT_FOLDER_ID = 11;
        const ALLOWED_SHEET_TYPES = ['xlsx', 'xls', 'ods'];

        /**
         * @function onRequest
         * @description Creates UI page for user to upload CSV or Spreadsheet file for CSV Import and initiates scheduler.
         *
         * @param {object} context - Suitelet context object.
         * @return null
         */
        let onRequest = (context) => {
            let formObject = serverWidget.createForm({
                title: 'Upload CSV/Spreadsheet File'
            });

            let sHttp = [];
            sHttp['GET'] = processGet;
            sHttp['POST'] = processPost;
            sHttp[context.request.method](context, formObject);

            context.response.writePage({
                pageObject: formObject
            });
        }

        /**
         * @function processGet
         * @description Creates page objects for uploading file.
         *
         * @param {object} context - Suitelet context object.
         * @param {object} uiForm - Form being used.
         * @return null
         */
        let processGet = (context, uiForm) => {
            let subsidiaryField = uiForm.addField({
                id: 'subsidiary_selection',
                label: 'Subsidiary',
                type: serverWidget.FieldType.SELECT
            });
            let csvFileField = uiForm.addField({
                id: 'csv_file',
                label: 'Select File',
                type: serverWidget.FieldType.FILE
            });
            csvFileField.isMandatory = true;

            subsidiaryField.addSelectOption({
                value: ' ',
                text: ' ',
                isSelected: true
            });

            let subsidiarySearch = search.create({
                type: search.Type.EMPLOYEE,
                filters: [
                    ['internalid', 'anyof', runtime.getCurrentUser().id]
                ],
                columns: [search.createColumn({
                    name: 'subsidiaries',
                    join: 'role',
                    sort: search.Sort.ASC
                })]
            });

            subsidiarySearch.run().each((ssResult) => {
                subsidiaryField.addSelectOption({
                    text: ssResult.getText({
                        name: 'subsidiaries',
                        join: 'role'
                    }),
                    value: ssResult.getValue({
                        name: 'subsidiaries',
                        join: 'role'
                    })
                });

                return true;
            });

            uiForm.addSubmitButton({
                label: 'Submit'
            });
        }

        /**
         * @function processPost
         * @description Captures user uploaded file and creates CSV Import Queue records for processing.
         *
         * @param {object} context - Suitelet context object.
         * @param {object} uiForm - Form being used.
         * @return null
         */
        let processPost = (context, uiForm) => {
            let unixTime = new Date().getTime();
            let currentUserId = runtime.getCurrentUser().id;
            let uploadedFile = context.request.files.csv_file;
            let uploadedFileExtension = uploadedFile.name.split('.').pop().toLowerCase();
            let folderId = getCsvFolderId(CSV_PARENT_FOLDER_ID);
            let pageInfoField = uiForm.addField({
                id: 'page_info',
                label: '#',
                type: serverWidget.FieldType.INLINEHTML
            });

            try {
                if (uploadedFileExtension === 'csv') {
                    uploadedFile.name = unixTime + '.csv';
                    uploadedFile.folder = folderId;
                    if (!nseLib.isEmpty(context.request.parameters.subsidiary_selection.trim())) {
                        let fileId = uploadedFile.save();
                        createCsvImportQueueRecord({
                            custrecord_nse_csv_import_file_id: fileId,
                            custrecord_nse_csv_import_user: currentUserId,
                            custrecord_nse_csv_import_subsidiary: context.request.parameters.subsidiary_selection
                        });
                    } else {
                        throw error.create({
                            name: 'NSE_NO_SUB_ERR',
                            message: 'Subsidiary must be selected when uploading a single CSV file.',
                            notifyOff: true
                        });
                    }
                } else if (ALLOWED_SHEET_TYPES.includes(uploadedFileExtension)) {
                    let subsidiaryIds = getSubsidiaryIds();
                    let workbook = XLSX.read(uploadedFile.getContents(), {type: 'base64'});
                    for (let sn in workbook.SheetNames) {
                        if (!subsidiaryIds.includes(parseInt(workbook.SheetNames[sn]))) {
                            throw error.create({
                                name: 'NSE_WRG_SH_NAM',
                                message: 'Sheet names must be valid Internal IDs of the subsidiaries.',
                                notifyOff: true
                            });
                            return;
                        }
                    }
                    for (let sn in workbook.SheetNames) {
                        let sheet = workbook.Sheets[workbook.SheetNames[sn]];
                        let csvFile = file.create({
                            fileType: file.Type.CSV,
                            name: unixTime + '_' + workbook.SheetNames[sn] + '.csv',
                            contents: XLSX.utils.sheet_to_csv(sheet),
                            folder: folderId
                        });
                        let fileId = csvFile.save();
                        createCsvImportQueueRecord({
                            custrecord_nse_csv_import_file_id: fileId,
                            custrecord_nse_csv_import_user: currentUserId,
                            custrecord_nse_csv_import_subsidiary: workbook.SheetNames[sn]
                        });
                    }
                } else {
                    throw error.create({
                        name: 'NSE_FT_NOT_SUP_ERR',
                        message: 'File type "' + uploadedFileExtension + '" not supported.',
                        notifyOff: true
                    });
                }

                nseLib.initiateQueueScheduler();

                pageInfoField.defaultValue = 'Backend task to process the CSV file(s) has been submitted.<br>' +
                    'You will receive a summary email when the processing is completed.<br>' +
                    'Please note this file name reference in case of errors: ' + unixTime + '<br>' +
                    'You may close this window.';
            } catch (e) {
                pageInfoField.defaultValue = 'An error occurred while submitting the backend task. <br>' +
                    'Please find the details below. <br><br>' +
                    'Code: ' + e.name + '<br>' +
                    'Details: ' + e.message + '<br><br>' +
                    'Please contact your NetSuite Administrator before proceeding. ' +
                    'Submitting the same file may cause duplicate processing of the records.';
            }
        }

        /**
         * @function getCsvFolderId
         * @description Finds or creates CSV file folder that can be used based on today's date.
         *
         * @param {number} parentFolderId - Internal ID of the parent folder.
         * @return {number} - Internal ID of the CSV file folder.
         */
        let getCsvFolderId = (parentFolderId) => {
            let folderName = new Date().toJSON().slice(0, 7);
            let folderSearch = search.create({
                type: search.Type.FOLDER,
                filters: [
                    ['parent', 'anyof', [parentFolderId]], 'AND',
                    ['name', 'is', folderName]
                ]
            });
            let folderSearchResults = folderSearch.run().getRange({start: 0, end: 1});
            if (!nseLib.isEmpty(folderSearchResults)) {
                return folderSearchResults[0].id;
            }

            let folderRecord = record.create({
                type: record.Type.FOLDER
            });
            folderRecord.setValue({
                fieldId: 'parent',
                value: parentFolderId
            });
            folderRecord.setValue({
                fieldId: 'name',
                value: folderName
            });

            return folderRecord.save();
        }

        /**
         * @function createCsvImportQueueRecord
         * @description Creates CSV Import Queue record for processing.
         *
         * @param {object} options - CSV Import Queue record fields and values.
         * @return {number} - Internal ID of the CSV Import Queue record.
         */
        let createCsvImportQueueRecord = (options) => {
            let ciqRecord = record.create({
                type: 'customrecord_nse_csv_import_queue'
            });

            for (let o in options) {
                ciqRecord.setValue({
                    fieldId: o,
                    value: options[o]
                });
            }

            return ciqRecord.save();
        }

        /**
         * @function getSubsidiaryIds
         * @description Finds Internal IDs of the active subsidiaries.
         *
         * @return {array} - Internal IDs of the subsidiaries.
         */
        let getSubsidiaryIds = () => {
            let returnData = [];
            let subsidiarySearch = search.create({
                type: search.Type.SUBSIDIARY,
                filters: [
                    ['isinactive', 'is', false]
                ]
            });
            subsidiarySearch.run().each((ssResult) => {
                returnData.push(parseInt(ssResult.id));
                return true;
            });

            return returnData;
        }

        return {
            onRequest: onRequest
        };

    });
