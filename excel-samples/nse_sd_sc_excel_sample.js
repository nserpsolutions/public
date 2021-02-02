/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @NScriptType ScheduledScript
 * @NAmdConfig /SuiteScripts/Excel Samples/nse_sc_excel_sample_conf.json
 *
 * @author Selcuk Dogru
 * _nse_sc_excel_sample
 *
 * @module N/search
 * @module N/file
 * @module jszip
 * @module xlsx
 *
 * @description Generates Trial Balance Excel Report based on Transaction search.
 */

define(['N/search', 'N/file', 'jszip', 'xlsx'],
  function (search, file, JSZIP, XLSX) {
  /**
   * @function searchToAoa
   * @description Runs a search and generates array based on the result set. Limited to searches that return up to 4000 results.
   *
   * @param {object} searchObject - Search to be executed
   * @param {array} labels - Header line of the search results
   * @return {array} - Array of arrays that contain search rows
   */
  let searchToAoa = (searchObject, labels) => {
    let returnData = [];
    returnData.push(labels);
    
    searchObject.run().each((searchResult) => {
      let searchLineData = [];
      let resultValues = searchResult.getAllValues();
      for (let r in resultValues) {
        isEmpty(resultValues[r]) ? searchLineData.push('N/A') : searchLineData.push(util.isArray(resultValues[r]) ? resultValues[r][0].text : resultValues[r])
      }
      returnData.push(searchLineData);
      return true;
    });
    
    return returnData;
  }
  
  /**
   * @function createExcelFile
   * @description Based on the data, creates excel file and saves in File Cabinet
   *
   * @module N/file
   * @module xlsx
   * @module jszip
   *
   * @param {object} excelData - Report data
   * @param {integer} folderId - Internal ID of the folder that file to be saved in
   * @param {string} fileName - Name of the file
   * @return {integer} - Internal ID of the file created
   */
  let createExcelFile = (excelData, folderId, fileName) => {
    let workbook = XLSX.utils.book_new();
    for (e in excelData) {
      workbook.SheetNames.push(excelData[e].sheetName);

      let worksheet = XLSX.utils.aoa_to_sheet(excelData[e].rows);
      workbook.Sheets[excelData[e].sheetName] = worksheet;
    }

    let workbookOutput = XLSX.write(workbook, {
      booktype: 'xlsx',
      type: 'base64'
    });

    let excelFile = file.create({
      name: fileName + '.xlsx',
      fileType: file.Type.EXCEL,
      contents: workbookOutput,
      folder: folderId
    });

    return excelFile.save();
  }
  
  /**
   * @function excelFileToJson
   * @description Reads excel file and returns JSON data.
   *
   * @module N/file
   * @module xlsx
   * @module jszip
   *
   * @param {integer} fileId - Internal ID of the Excel file
   * @param {object} headers - Object that contains array of header line columns per sheet
   * @return {array} - Array of objects that contains sheet data
   */
  let excelFileToJson = (fileId, headers) => {
    let returnData = [];
    let excelFile = file.load({
      id: fileId
    });
    
    let workbook = XLSX.read(excelFile.getContents(), {type: 'base64'});
    for (let sn in workbook.SheetNames) {
      let sheet = workbook.Sheets[workbook.SheetNames[sn]];
      returnData.push(isEmpty(headers) || isEmpty(headers[workbook.SheetNames[sn]]) ? XLSX.utils.sheet_to_json(sheet) : XLSX.utils.sheet_to_json(sheet, headers[workbook.SheetNames[sn]]));
    }
    
    return returnData;
  }
  
  /**
   * @function isEmpty
   * @description Checks if given parameter holds a value, or not.
   *
   * @module N/util
   *
   * @param {object} value - Parameter to be checked
   * @return {boolean}
   */
  let isEmpty = (value) => {
    if (value == undefined || value == null)
      return true;
    if (util.isNumber(value) || util.isBoolean(value) || util.isDate(value) || util.isFunction(value))
      return false;
    if (util.isString(value))
      return (value.length == 0) ? true : false;
    return (Object.keys(value).length == 0) ? true : false;
  }

  return {
    execute: (context) => {
      let customerSearch = search.create({
        type: search.Type.CUSTOMER,
        filters: [
          ['datecreated', 'within', 'lastmonth']
        ],
        columns: ['entityid', 'companyname', 'email', 'salesrep', 'salesrep.email']
      });
      let headerLine = ['Entity ID', 'Company Name', 'Customer Email', 'Sales Rep Name', 'Sales Rep Email'];
      
      let searchData = searchToAoa(customerSearch, headerLine);
      
      let excelObject = [];
      excelObject.push({
        sheetName: 'Customers',
        rows: searchData
      })

      let fileId = createExcelFile(excelObject, 4774848, "Customers");
      let excelJsonData = excelFileToJson(fileId, {Customers: headerLine});
    }
  };
});
