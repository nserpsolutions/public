/**
 * @NApiVersion 2.0
 * @NModuleScope Public
 * @NScriptType ClientScript
 *
 * @author Selcuk Dogru
 * _nse_cl_void_cp
 *
 * @module N/record
 * @module N/search
 * @module N/url
 * @module N/https
 * @module N/currentRecord
 * @module N/ui/dialog
 * @module N/ui/message
 * @module N/runtime
 *
 * @description Handles creation and applying of the voiding Journal
 */
define(['N/record', 'N/search', 'N/url', 'N/https', 'N/currentRecord', 'N/ui/dialog', 'N/ui/message', 'N/runtime'],
function(record, search, url, https, currentRecord, dialog, message, runtime) {
  function pageInit() {

  };

  /**
   * @function voidCustomerPayment
   * @description Creates Journal Record to Reverse the Customer Payment. Triggers Suitelet to apply the Journal to the Customer Payment.
   *
   * @module N/runtime
   * @module N/record
   * @module N/url
   * @module N/https
   * @module N/ui/dialog
   * @module N/ui/message
   * @module N/currentRecord
   * @param {integer} recordId - Internal ID of the Customer Payment record
   * @return {void}
  */
  function voidCustomerPayment(recordId) {
    var cUser = runtime.getCurrentUser();
    var userMessage = message.create({
      type: message.Type.INFORMATION,
      title: 'Voiding Customer Payment',
      message: 'Dear ' + cUser.name.split(' ')[0] + ', <br><br>' +
        'Process for voiding of this record started. You can continue working on other windows. <br>' +
        'This page will be refreshed automatically when process is completed.<br><br>' +
        'If you encounter any unexpected behavior, please contact your NetSuite Service Desk.',
      duration: 60000
    });
    userMessage.show();

    var cRecord = currentRecord.get();
    var voidButton = cRecord.getField({
      fieldId: 'custpage_void_cp'
    });
    voidButton.isDisabled = true;

    var customerPaymentFields = [
      'customer',
      'currency',
      'exchangerate',
      'account',
      'aracct',
      'department',
      'class',
      'location',
      'payment',
      'subsidiary',
      'externalid',
      'tranid',
      'id',
      'postingperiod'
    ];

    record.load.promise({
      type: search.Type.CUSTOMER_PAYMENT,
      id: recordId
    }).then(function (customerPaymentRecord) {
      var customerPaymentData = {};
      for (c in customerPaymentFields) {
        customerPaymentData[customerPaymentFields[c]] = customerPaymentRecord.getValue({
          fieldId: customerPaymentFields[c]
        });
      }

      var accountingPeriodDetails = search.lookupFields({
        type: search.Type.ACCOUNTING_PERIOD,
        id: customerPaymentData.postingperiod,
        columns: ['closed', 'allownonglchanges']
      });

      if(accountingPeriodDetails.closed && !accountingPeriodDetails.allownonglchanges) {
        dialog.alert({
          title: 'Voiding Customer Payment',
          message: 'Hello ' + cUser.name.split(' ')[0] + ',<br><br>' +
          'Script did not proceed with the Voiding process. <br>' +
          'Related Accounting Period of the Customer Payment is Closed and Non GL Changes is not allowed.<br>' +
          'Please contact your NetSuite Service Desk.'
        });
        return;
      }

      record.create.promise({
        type: record.Type.JOURNAL_ENTRY
      }).then(function (jRec) {
        setJournalRecordValues(jRec, customerPaymentData);
        var journalRecordId = jRec.save();

        https.get.promise({
          url: url.resolveScript({
            scriptId: 'customscript_nse_sl_void_cp',
            deploymentId: 'customdeploy_nse_sl_void_cp',
            params: {
              paymentid: recordId,
              journalid: journalRecordId
            }
          })
        }).then(function (response) {
          window.location.reload();
        }).catch(function (getErr) {
          var journalUrl = url.resolveRecord({
            recordType: record.Type.JOURNAL_ENTRY,
            recordId: journalRecordId,
            isEditMode: false
          });
          dialog.alert({
            title: 'Voiding Customer Payment',
            message: 'Hello ' + cUser.name.split(' ')[0] + ',<br><br>' +
            'Script did not succeeded to complete the voiding process but at least tried. <br>' +
            'Please <b>review</b> the following Journal Entry created: <a href="' + journalUrl + '" target="_blank">' + journalRecordId + '</a><br>' +
            'It is time to contact your NetSuite Service Desk.'
          });
          console.log('getErr: ' + JSON.stringify(getErr));
        });
      }).catch(function (createErr) {
        dialog.alert({
          title: 'Voiding Customer Payment',
          message: 'Hello ' + cUser.name.split(' ')[0] + ',<br><br>' +
          'Script did not succeeded to complete the voiding process but at least tried. <br>' +
          'It is time to contact your NetSuite Service Desk.'
        });
        console.log('createErr: ' + JSON.stringify(createErr));
      });
    }).catch(function (loadErr) {
      console.log('loadErr: ' + JSON.stringify(loadErr));
    });
  }

  function setJournalRecordValues(journalRecord, recordValues) {
      journalRecord.setValue({
        fieldId: 'subsidiary',
        value: recordValues.subsidiary
      });
      journalRecord.setValue({
        fieldId: 'currency',
        value: recordValues.currency
      });
      journalRecord.setValue({
        fieldId: 'exchangerate',
        value: recordValues.exchangerate
      });

      var lineMemo = 'Void of Customer Payment #' + recordValues.tranid;
      if(recordValues.externalid != null && recordValues.externalid != '')
        lineMemo += ' | External ID: ' + recordValues.externalid;

      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        line: 0,
        value: recordValues.aracct
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'debit',
        line: 0,
        value: recordValues.payment
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'entity',
        line: 0,
        value: recordValues.customer
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'department',
        line: 0,
        value: recordValues.department
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'class',
        line: 0,
        value: recordValues.class
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'location',
        line: 0,
        value: recordValues.location
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        line: 0,
        value: lineMemo
      });

      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'account',
        line: 1,
        value: recordValues.account
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'credit',
        line: 1,
        value: recordValues.payment
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'entity',
        line: 1,
        value: recordValues.customer
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'department',
        line: 1,
        value: recordValues.department
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'class',
        line: 1,
        value: recordValues.class
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'location',
        line: 1,
        value: recordValues.location
      });
      journalRecord.setSublistValue({
        sublistId: 'line',
        fieldId: 'memo',
        line: 1,
        value: lineMemo
      });
  }

  return {
    pageInit: pageInit,
    voidCustomerPayment: voidCustomerPayment
  };
});
