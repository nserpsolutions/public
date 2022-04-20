/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope TargetAccount
 *
 * @author Selcuk Dogru
 * _nse_rl_export_query
 *
 * @description Runs Saved Search or SuiteQL Query and returns results.
 */

define(['N/search', 'N/query'], (search, query) => {
    const PAGE_SIZE = 1000;

    const get = (params) => {
        let returnData = [];
        const nsSearch = search.load({
            id: params.searchid
        });

        const pagedData = nsSearch.runPaged({
            pageSize: PAGE_SIZE
        });

        const pageCount = Math.ceil(pagedData.count/1000);
        for (let i = 0; i < pageCount; i++) {
            let searchPage = pagedData.fetch({
                index: i
            });
            searchPage.data.forEach((searchResult) => {
                let resultData = {};
                for (let column of searchResult.columns) {
                    resultData[column.label] = searchResult.getText(column) ? searchResult.getText(column) : searchResult.getValue(column);
                }
                
                returnData.push(resultData)
            });
        }

        return JSON.stringify(returnData);
    }

    const post = (params) => {
        let returnData = [];

        const pagedData = query.runSuiteQLPaged({
            query: params.sql,
            pageSize: PAGE_SIZE
        });

        const pageCount = Math.ceil(pagedData.count/1000);
        pagedData.iterator().each((resultPage) => {
            resultPage.value.data.iterator().each((queryResult) => {
                returnData.push(queryResult.value.asMap())

                return true;
            });

            return true;
        });

        return returnData;
    }
    return {
        get,
        post
    }
});
