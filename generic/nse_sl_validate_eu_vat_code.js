/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @NScriptType Suitelet
 *
 * @author Selcuk Dogru
 * _nse_sl_validate_eu_vat_code
 *
 * @description
 */
define(['N/xml', 'N/https', 'N/ui/serverWidget'],
    (xml, https, serverWidget) => {
        const VIES_SOAP_URL = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService';

        const onRequest = (context) => {
            let formObject = serverWidget.createForm({
                title: 'Validate EU VAT Code'
            });

            let sHttp = [];
            sHttp['GET'] = processGet;
            sHttp['POST'] = processPost;
            sHttp[context.request.method](context, formObject);

            context.response.writePage({
                pageObject: formObject
            });
        }

        const processGet = (context, uiForm) => {
            uiForm.addField({
                id: 'nse_country_code',
                label: 'Country Code',
                type: serverWidget.FieldType.TEXT
            });
            uiForm.addField({
                id: 'nse_vat_number',
                label: 'VAT Number',
                type: serverWidget.FieldType.TEXT
            });

            uiForm.addSubmitButton({
                label: 'Submit'
            });
        }

        const processPost = (context, uiForm) => {
            let vatCodeDetails = getEuVatCodeDetails(context.request.parameters.nse_country_code, context.request.parameters.nse_vat_number);
            let dataField = uiForm.addField({
                id: 'nse_country_code',
                label: 'Country Code',
                type: serverWidget.FieldType.INLINEHTML
            });
            dataField.defaultValue = JSON.stringify(vatCodeDetails);
        }

        /**
         * @function getEuVatCodeDetails
         * @description Sends a request to VIES to validate EU VAT Code
         *
         * @param {string} countryCode - 2 letter country ISO Code
         * @param {string} vatNumber - VAT Number of the entity
         * @return {object} - JSON Object that contains the response from VIES
         */
        const getEuVatCodeDetails = (countryCode, vatNumber) => {
            let xmlString = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" ` +
                `xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">\n` +
                `<soap:Body>` +
                `<urn:checkVat>` +
                `<urn:countryCode>${countryCode}</urn:countryCode>` +
                `<urn:vatNumber>${vatNumber}</urn:vatNumber>` +
                `</urn:checkVat>` +
                `</soap:Body>` +
                `</soap:Envelope>`;
            let viesResponse = https.post({
                url: VIES_SOAP_URL,
                body: xmlString,
                headers: {
                    'Content-Type': 'text/plain'
                }
            });

            let returnData = {
                status: viesResponse.code
            };

            if (viesResponse.code === 200) {
                let xmlData = xml.Parser.fromString({
                    text: viesResponse.body
                });
                let child = xmlData.firstChild;

                while (child.firstChild !== null) {
                    child = child.firstChild
                    if (child.firstChild.nodeName === '#text') {
                        let sibling = child;
                        while (sibling) {
                            returnData[sibling.nodeName] = sibling.textContent;
                            sibling = sibling.nextSibling;
                        }
                        break;
                    }
                }
            }

            return returnData;
        }

        return {
            onRequest
        };
    });
