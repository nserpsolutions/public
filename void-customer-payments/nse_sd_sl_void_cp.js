/**
 * @NApiVersion 2.0
 * @NModuleScope Public
 * @NScriptType Suitelet
 *
 * @author Selcuk Dogru
 * _nse_sl_void_cp
 *
 * @module N/record
 * @module N/search
 * @module N/https
 * @module N/format
 *
 * @description Approves the Journal record if Pending Approval and applies to the Customer Payment. If there is associated Overpayment Journal, creates additional Journal record to reverse.
 */
define(['N/record', 'N/search', 'N/https', 'N/format'],
function(record, search, https, format) {
  function onRequest(params) {
    if (params.request.method == https.Method.GET) {
      var paymentRecordId = params.request.parameters.paymentid;
      var journalRecordId = params.request.parameters.journalid;

      approveJournalEntry(journalRecordId);

      var paymentRecord = record.load({
        type: record.Type.CUSTOMER_PAYMENT,
        id: paymentRecordId
      });

      var lineCount = paymentRecord.getLineCount({
        sublistId: 'apply'
      });
      for(i = 0; i < lineCount; i++) {
        var lineInternalId = paymentRecord.getSublistValue({
          sublistId: 'apply',
          fieldId: 'internalid',
          line: i
        });
        var isApplied = paymentRecord.getSublistValue({
          sublistId: 'apply',
          fieldId: 'apply',
          line: i
        });
        var transactionType = paymentRecord.getSublistValue({
          sublistId: 'apply',
          fieldId: 'type',
          line: i
        });
        if (isApplied && transactionType == 'Journal') {
          var appliedJournalRecord = record.load({
            type: record.Type.JOURNAL_ENTRY,
            id: lineInternalId
          });
          if(appliedJournalRecord.getValue({fieldId: 'memo'}) == 'Overpayment Journal') {
            var overpaymentJournalData = getOverpaymentJournalData(appliedJournalRecord, paymentRecord);
            var overpaymentJournalId = createJournalRecord(overpaymentJournalData);
            approveJournalEntry(overpaymentJournalId);
          }
        }
        paymentRecord.setSublistValue({
          sublistId: 'apply',
          fieldId: 'apply',
          line: i,
          value: (lineInternalId == journalRecordId ? true : false)
        });
      }
      return paymentRecord.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });
    }
  }

  /**
   * @function approveJournalEntry
   * @description Approves the Journal Record
   *
   * @module N/search
   * @module N/record
   * @param {integer} journalInternalId - Internal ID of the Journal record
   * @return {void}
  */
  function approveJournalEntry(journalInternalId) {
    var journalStatus = search.lookupFields({
      type: search.Type.JOURNAL_ENTRY,
      id: journalInternalId,
      columns: [
        'status'
      ]
    });
    if(journalStatus.status[0].value != 'approved') {
      record.submitFields({
        type: record.Type.JOURNAL_ENTRY,
        id: journalInternalId,
        values: {
          approved: true
        }
      });
    }
  }

  /**
   * @function getOverpaymentJournalData
   * @description Captures the data to reverse the Overpayment Journal applied to the Customer Payment
   *
   * @param {object} journalRec - Overpayment Journal record
   * @param {object} paymentRec - Customer payment record
   * @return {object} - JSON Object that contains data to create reversing Journal record for the Overpayment
  */
  function getOverpaymentJournalData(journalRec, paymentRec) {
    var reversalJournalData = {};
    reversalJournalData.subsidiary = journalRec.getValue({
      fieldId: 'subsidiary'
    });
    reversalJournalData.currency = journalRec.getValue({
      fieldId: 'currency'
    });
    reversalJournalData.trandate = getTransactionDateByPeriod(journalRec.getValue({fieldId: 'postingperiod'}));
    reversalJournalData.lines = [];

    var lineCount = journalRec.getLineCount({
      sublistId: 'line'
    });
    var paymentCustomerId = paymentRec.getValue({
      fieldId: 'customer'
    });
    var paymentTransactionId = paymentRec.getValue({
      fieldId: 'tranid'
    });
    for(l = 0; l < lineCount; l++) {
      var lineMemo = journalRec.getSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        line: l
      });
      var lineCustomerId = journalRec.getSublistValue({
        sublistId: 'line',
        fieldId: 'entity',
        line: l
      });
      if(paymentCustomerId == lineCustomerId) {
        if(lineMemo.indexOf(paymentTransactionId) != -1) {
          reversalJournalData.lines.push({
            account: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'account',
              line: l
            }),
            credit: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'debit',
              line: l
            }),
            memo: 'Reversing Overpayment ' + paymentTransactionId,
            entity: lineCustomerId,
            department: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'department',
              line: l
            }),
            class: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'class',
              line: l
            }),
            location: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'location',
              line: l
            })
          });
        } else if(lineMemo == '') {
          reversalJournalData.lines.push({
            account: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'account',
              line: l
            }),
            debit: reversalJournalData.lines[0].credit,
            memo: 'Reversing Overpayment ' + paymentTransactionId,
            entity: lineCustomerId,
            department: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'department',
              line: l
            }),
            class: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'class',
              line: l
            }),
            location: journalRec.getSublistValue({
              sublistId: 'line',
              fieldId: 'location',
              line: l
            })
          });
        }
      }
    }

    return reversalJournalData;
  }

  /**
   * @function createJournalRecord
   * @description Creates Journal record based on the data
   *
   * @module N/record
   * @param {object} recordData - JSON Object that contains Journal details
   * @return {integer} - Internal ID of the created Journal record
  */
  function createJournalRecord(recordData) {
    var jRec = record.create({
      type: record.Type.JOURNAL_ENTRY,
      isDynamic: true
    });

    for(key in recordData) {
      if(key == 'lines') {
        for (l in recordData[key]) {
          jRec.selectNewLine({
            sublistId: 'line'
          });
          for(lineKey in recordData[key][l]) {
            jRec.setCurrentSublistValue({
              sublistId: 'line',
              fieldId: lineKey,
              value: recordData[key][l][lineKey]
            });
          }
          jRec.commitLine({
            sublistId: 'line'
          });
        }
      } else
        jRec.setValue({
          fieldId: key,
          value: recordData[key]
        });
    }

    return jRec.save();
  }

  /**
   * @function getTransactionDateByPeriod
   * @description Finds the transaction date to be set based on Accounting Period status.
   *
   * @module N/search
   * @param {integer} accountingPeriodId - Internal ID of the Accounting Period
   * @return {date} - Date to be set as transaction date
  */
  function getTransactionDateByPeriod(accountingPeriodId) {
    var accountingPeriodData = search.lookupFields({
      type: search.Type.ACCOUNTING_PERIOD,
      id: accountingPeriodId,
      columns: ['arlocked', 'closed', 'enddate']
    });

    return (accountingPeriodData.arlocked || accountingPeriodData.closed || format.parse({value: accountingPeriodData.enddate, type: format.Type.DATE}) > new Date()) ? new Date() : format.parse({value: accountingPeriodData.enddate, type: format.Type.DATE});
  }

  return {
    onRequest: onRequest
  };
});
