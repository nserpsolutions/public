/**
 * @NApiVersion 2.0
 * @NScriptType UserEventScript
 * @NModuleScope Public
 *
 * @author Selcuk Dogru
 * _nse_ue_void_cp
 *
 * @description Attaches the client script and adds Button to associate with the Client Script function
 */

const INVOICE_TYPE = 'CustInvc';

define(function () {
   function beforeLoad(scriptContext) {
     if(scriptContext.type == scriptContext.UserEventType.VIEW) {
       var cRecord = scriptContext.newRecord;
       var customerName = cRecord.getText({
         fieldId: 'customer'
       });

       var lineCount = cRecord.getLineCount({
         sublistId: 'apply'
       });
       for (i = 0; i < lineCount; i++) {
         var transactionType = cRecord.getSublistValue({
           sublistId: 'apply',
           fieldId: 'trantype',
           line: i
         });
         if(transactionType == INVOICE_TYPE) {
           var uiForm = scriptContext.form;
           uiForm.clientScriptModulePath = 'SuiteScripts/Customer Payments/nse_sd_cl_void_cp.js';
           uiForm.addButton({
             id: 'custpage_void_cp',
             label: 'Void 2.0',
             functionName: 'voidCustomerPayment(' + cRecord.id + ');'
           });
           break;
         }
       }
     }
   }
  return {
    beforeLoad: beforeLoad
  };
});
