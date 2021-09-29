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
WHERE TL.subsidiary = '6' AND
  TAL.posting = 'T' AND
  ((A.accttype IN ('Income', 'Expense', 'OthIncome', 'OthExpense', 'COGS') AND
    AP.enddate < TO_DATE('20210901', 'YYYYMMDD') AND
    AP.startdate > TO_DATE('20210331', 'YYYYMMDD')
  ) OR
  (A.accttype NOT IN ('Income', 'Expense', 'OthIncome', 'OthExpense', 'COGS') AND
    AP.enddate < TO_DATE('20210901', 'YYYYMMDD') 
  )) AND
  TL.id = TAL.transactionline AND
  A.acctnumber <> '30000000021'
GROUP BY A.acctnumber,
  A.fullname,
  BUILTIN.DF(TL.department),
  BUILTIN.DF(TL.class),
  BUILTIN.DF(TL.location) 
HAVING SUM(TAL.amount) <> 0
UNION SELECT SUM(-TAL.amount) AS GLAmount,
  '30000000021' AS AccountNumber,
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
WHERE TL.subsidiary = '6' AND
  TAL.posting = 'T' AND
  ((A.accttype IN ('Income', 'Expense', 'OthIncome', 'OthExpense', 'COGS') AND
    AP.enddate < TO_DATE('20210901', 'YYYYMMDD') AND
    AP.startdate > TO_DATE('20210331', 'YYYYMMDD')
  ) OR
  (A.accttype NOT IN ('Income', 'Expense', 'OthIncome', 'OthExpense', 'COGS') AND
    AP.enddate < TO_DATE('20210901', 'YYYYMMDD') 
  )) AND
  TL.id = TAL.transactionline AND
  A.acctnumber <> '30000000021'
GROUP BY '30000000021',
  'Retained Earnings',
  BUILTIN.DF(TL.department),
  BUILTIN.DF(TL.class),
  BUILTIN.DF(TL.location) 
HAVING SUM(TAL.amount) <> 0
