import jdbcConMod

accountId = ''
roleId = ''
consumerKey = ''
consumerSecret = ''
tokenId = ''
tokenSecret = ''

sqlQuery = 'select tranid from transaction'

tokenPassword = jdbcConMod.generateTokenPassword(accountId, consumerKey, consumerSecret, tokenId, tokenSecret)
nsConnection = jdbcConMod.createJdbcConnection(accountId, roleId, 'TBA', tokenPassword)

nsStatement = nsConnection.createStatement()
resultSet = nsStatement.executeQuery(sqlQuery)

# Add your logic below

while resultSet.next(): 
	print(resultSet.getString(1))

# 

resultSet.close()
nsStatement.close()
nsConnection.close()
