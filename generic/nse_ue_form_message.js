/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @NScriptType UserEventScript
 *
 * @author Selcuk Dogru
 * _nse_ue_form_message
 *
 * @module N/runtime
 *
 * @description Shows informational message on Invoice record when Customer's overdue balance is over the limit.
 */

define(['N/runtime'],
function(runtime) {
	let beforeLoad = (context) => {
		let newRecord = context.newRecord;

		if ((context.type === 'view') && runtime.executionContext === runtime.ContextType.USER_INTERFACE) {
			let inlineField = context.form.addField({
				id: 'custpage_nse_form_message',
				label: 'Form Message',
				type: serverWidget.FieldType.INLINEHTML
			});

			inlineField.defaultValue = '<script>setTimeout(()=>{require(["N/ui/message","N/currentRecord","N/search"],(message,currentRecord,search)=>{let cRecord=currentRecord.get();let entityDetails=search.lookupFields({type:search.Type.INVOICE,id:cRecord.id,columns:["customer.overduebalance"]});if(parseFloat(entityDetails["customer.overduebalance"])>10){let myMsg=message.create({title:"Overdue Balance",message:"Customer\'s overdue balance is "+entityDetails["customer.overduebalance"]+" EUR.",type:message.Type.INFORMATION});myMsg.show();}});},500)</script>';
		}
	}
	
	return {
		beforeLoad: beforeLoad
	}
}