/**
 * @NApiVersion 2.0
 * @NModuleScope Public
 * @NScriptType MapReduceScript
 *
 * @author Selcuk Dogru
 * _nse_mr_apply_overpayments
 *
 * @module N/record
 * @module N/search
 * @module N/runtime
 * @module N/format
 *
 * @description Based on the maximum amount set on the Script Deployment, finds overpayments made by customers and creates Journal Entry to realize.
 */

define(['N/record', 'N/search', 'N/runtime', 'N/format'],
function(record, search, runtime, format) {
  const SCRIPT_PARAMS = {
    subsidiary: 'custscript_nse_mr_ao_subsidiary',
    currency: 'custscript_nse_mr_ao_currency',
    amount: 'custscript_nse_mr_ao_amount',
    account: 'custscript_nse_mr_ao_account',
    department: 'custscript_nse_mr_ao_department',
    class: 'custscript_nse_mr_ao_class',
    location: 'custscript_nse_mr_ao_location',
    startDate: 'custscript_nse_mr_ao_start_date'
  }

  function getInputData(inputContext) {
    var scriptParams = getScriptParams(SCRIPT_PARAMS);

    var overPaymentSearch = search.create({
      type: search.Type.CUSTOMER_PAYMENT,
      filters: [
        ['subsidiary', 'anyof', scriptParams.subsidiary], 'AND',
        ['datecreated', 'onorafter', format.format({value: scriptParams.startDate, type: format.Type.DATE})], 'AND',
        ['currency', 'anyof', scriptParams.currency], 'AND',
        [
          ['amountremaining', 'greaterthan', 0], 'AND',
          ['fxamountremaining', 'lessthanorequalto', scriptParams.amount]
        ]
      ],
      columns: ['tranid', 'account', 'fxamountremaining', 'entity', 'department', 'class', 'location', 'postingperiod']
    });

    return overPaymentSearch;
  }

  function map(mapContext) {
    var customerPaymentData = JSON.parse(mapContext.value);

    mapContext.write({
      key: customerPaymentData.values.postingperiod.value,
      value: {
        internalId: customerPaymentData.id,
        tranId: customerPaymentData.values.tranid,
        account: customerPaymentData.values.account.value,
        amount: customerPaymentData.values.fxamountremaining,
        entity: customerPaymentData.values.entity.value,
        entityName: customerPaymentData.values.entity.text,
        department: customerPaymentData.values.department.value,
        class: customerPaymentData.values.class.value,
        location: customerPaymentData.values.location.value
      }
    });
  }

  function reduce(reduceContext) {
    var scriptParams = getScriptParams(SCRIPT_PARAMS);

    var journalRecord = record.create({
      type: record.Type.JOURNAL_ENTRY,
      isDynamic: true
    });
    journalRecord.setValue({
      fieldId: 'subsidiary',
      value: scriptParams.subsidiary
    });
    journalRecord.setValue({
      fieldId: 'currency',
      value: scriptParams.currency
    });
    journalRecord.setValue({
      fieldId: 'trandate',
      value: getTransactionDateByPeriod(reduceContext.key)
    });
    journalRecord.setValue({
      fieldId: 'memo',
      value: 'Overpayment Journal'
    });

    var creditAmounts = [];
    var customerPaymentIds = [];
    for(v in reduceContext.values) {
      var paymentData = JSON.parse(reduceContext.values[v]);
      customerPaymentIds.push(paymentData.internalId);
      addJournalDebitLine(journalRecord, paymentData);
      if(creditAmounts[paymentData.entity] == null) {
        creditAmounts[paymentData.entity] = parseFloat(paymentData.amount);
      } else {
        creditAmounts[paymentData.entity] += parseFloat(paymentData.amount);
      }
    }
    for(c in creditAmounts) {
      addJournalCreditLine(journalRecord, c, creditAmounts[c], scriptParams);
    }

    var journalRecordId = journalRecord.save();
    log.debug('journalRecordId', journalRecordId);

    for(p in customerPaymentIds) {
      applyJournalToCustomerPayment(customerPaymentIds[p], journalRecordId);
    }
  }

  function summarize(summaryContext) {
    summaryContext.mapSummary.errors.iterator().each(function (key, error){
      var errorObject = JSON.parse(error);
      log.error({
        title:'Map error for key: ' + key,
        details: errorObject.name + ': ' + errorObject.message
      });
      return true;
    });
    summaryContext.reduceSummary.errors.iterator().each(function (key, error){
      var errorObject = JSON.parse(error);
      log.error({
        title:'Reduce error for key: ' + key,
        details: errorObject.name + ': ' + errorObject.message
      });
      return true;
    });
  }

  /**
   * @function getScriptParams
   * @description Gets the script parameters.
   *
   * @module N/runtime
   * @param {object} params - Name/ID pairs
   * @returns {object} - Name/Value pairs
   */
  function getScriptParams(params) {
    var scriptObject = runtime.getCurrentScript();
    var returnData = {};

    for (s in params) {
      returnData[s] = scriptObject.getParameter({
        name: params[s]
      });
    }

    return returnData;
  }

  /**
   * @function addJournalDebitLine
   * @description Adds a debit line to the Journal Entry
   *
   * @param {object} jRec - Journal Entry Record
   * @param {object} pData - Payment Data to be added
   * @returns {null}
   */
  function addJournalDebitLine(jRec, pData) {
    jRec.selectNewLine({
      sublistId: 'line'
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'account',
      value: pData.account
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'debit',
      value: parseFloat(pData.amount)
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'memo',
      value:  pData.entityName + ' | ' + pData.tranId
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'entity',
      value:  pData.entity
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'department',
      value:  pData.department
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'class',
      value:  pData.class
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'location',
      value:  pData.location
    });
    jRec.commitLine({
      sublistId: 'line'
    });
  }

  /**
   * @function addJournalCreditLine
   * @description Adds a credit line to the Journal Entry
   *
   * @param {object} jRec - Journal Entry Record
   * @param {number} customerId - Internal ID of the customer
   * @param {number} creditAmount - Amount to be credited
   * @param {object} sParams - Script parameters
   * @returns {null}
   */
  function addJournalCreditLine(jRec, customerId, creditAmount, sParams) {
    jRec.selectNewLine({
      sublistId: 'line'
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'account',
      value: sParams.account
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'credit',
      value: creditAmount
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'entity',
      value:  customerId
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'department',
      value:  sParams.department
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'class',
      value:  sParams.class
    });
    jRec.setCurrentSublistValue({
      sublistId: 'line',
      fieldId: 'location',
      value:  sParams.location
    });
    jRec.commitLine({
      sublistId: 'line'
    });
  }

  /**
   * @function applyJournalToCustomerPayment
   * @description Applies created Journal Entry to the related Customer Payments
   *
   * @module N/record
   * @param {number} customerPaymentId - Internal ID of the Customer Payment
   * @param {number} journalEntryId - Internal ID of the Journal Entry
   * @returns {null}
   */
  function applyJournalToCustomerPayment(customerPaymentId, journalEntryId) {
    var customerPayment = record.load({
      type: record.Type.CUSTOMER_PAYMENT,
      id: customerPaymentId
    });
    var unappliedAmount = customerPayment.getValue({
      fieldId: 'unapplied'
    });
    var lineCount = customerPayment.getLineCount({
      sublistId: 'apply'
    });
    for(i = 0; i < lineCount; i++) {
      var lineInternalId = customerPayment.getSublistValue({
        sublistId: 'apply',
        fieldId: 'internalid',
        line: i
      });
      var lineDueAmount = customerPayment.getSublistValue({
        sublistId: 'apply',
        fieldId: 'due',
        line: i
      });
      if(lineInternalId == journalEntryId && lineDueAmount == unappliedAmount) {
        customerPayment.setSublistValue({
          sublistId: 'apply',
          fieldId: 'apply',
          line: i,
          value: true
        });
        customerPayment.setSublistValue({
          sublistId: 'apply',
          fieldId: 'amount',
          line: i,
          value: unappliedAmount
        });

        break;
      }
    }
    customerPayment.save();
  }

  /**
   * @function getTransactionDateByPeriod
   * @description Finds the transaction date to be set based on Accounting Period options
   *
   * @module N/search
   * @param {number} accountingPeriodId - Internal ID of the current Accounting Period
   * @returns {date} - Date to be set
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
    getInputData: getInputData,
    map: map,
    reduce: reduce,
    summarize: summarize
  };
});
