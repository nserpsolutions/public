SELECT SUM(TAL.amount) AS GLAmount, 
  A.acctnumber AS AccountNumber, 
  A.fullname AS AccountName,
  BUILTIN.DF(TL.department) AS Department,
  BUILTIN.DF(TL.class) AS WebSite,
  BUILTIN.DF(TL.location) AS Location
FROM transactionaccountingline TAL 
LEFT JOIN transaction T
  ON T.id = TAL.transaction
LEFT JOIN account A 
  ON TAL.account = A.id
LEFT JOIN transactionline TL
  ON TL.transaction = TAL.transaction
LEFT JOIN accountingperiod AP
  ON T.postingperiod = AP.id
LEFT JOIN subsidiary S
  ON S.id = TL.subsidiary
WHERE TL.subsidiary = '<SubsidiaryInternalID>' AND /*Internal ID of the subsidiary that the report should be generated for*/
  TAL.posting = 'T' AND
  AP.id = '<AccountingPeriodInternalID>' AND /*Internal ID of the accounting period that determines the report month*/
  TL.id = TAL.transactionline AND
  A.acctnumber <> '<RetainedEarningsAccountNumber>' /*Account Number of the Retained Earnings Account which is calculated separately.*/
GROUP BY A.acctnumber,
  A.fullname,
  BUILTIN.DF(TL.department),
  BUILTIN.DF(TL.class),
  BUILTIN.DF(TL.location) 
HAVING SUM(TAL.amount) <> 0
UNION SELECT SUM(-TAL.amount) AS GLAmount,
  '<RetainedEarningsAccountNumber>' AS AccountNumber, /*Account Number of the Retained Earnings Account which is calculated separately.*/
  'Retained Earnings' AS AccountName,
  BUILTIN.DF(TL.department) AS Department,
  BUILTIN.DF(TL.class) AS WebSite,
  BUILTIN.DF(TL.location) AS Location
FROM transactionaccountingline TAL 
LEFT JOIN transaction T
  ON T.id = TAL.transaction
LEFT JOIN account A 
  ON TAL.account = A.id
LEFT JOIN transactionline TL
  ON TL.transaction = TAL.transaction
LEFT JOIN accountingperiod AP
  ON T.postingperiod = AP.id
LEFT JOIN subsidiary S
  ON S.id = TL.subsidiary
WHERE TL.subsidiary = '<SubsidiaryInternalID>' AND /*Internal ID of the subsidiary that the report should be generated for*/
  TAL.posting = 'T' AND
  AP.id = '<AccountingPeriodInternalID>' AND /*Internal ID of the accounting period that determines the report month*/
  TL.id = TAL.transactionline AND
  A.acctnumber <> '<RetainedEarningsAccountNumber>' /*Account Number of the Retained Earnings Account which is calculated separately.*/
GROUP BY '<RetainedEarningsAccountNumber>', /*Account Number of the Retained Earnings Account which is calculated separately.*/
  'Retained Earnings',
  BUILTIN.DF(TL.department),
  BUILTIN.DF(TL.class),
  BUILTIN.DF(TL.location) 
HAVING SUM(TAL.amount) <> 0