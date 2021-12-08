import hmac
import hashlib
import base64
import secrets
import time

def generateTokenPassword(accountId, consumerKey, consumerSecret, tokenId, tokenSecret): 
	nonce = secrets.token_hex(12)
	timestamp = str(int(time.time()))

	baseString = f'{accountId}&{consumerKey}&{tokenId}&{nonce}&{timestamp}'
	signatureKey = f'{consumerSecret}&{tokenSecret}'
	hmacObject = hmac.new(bytes(signatureKey, 'utf-8'), baseString.encode('utf-8'), hashlib.sha256)
	nsSignature = base64.b64encode(hmacObject.digest()).decode() + '&HMAC-SHA256'

	return f'{baseString}&{nsSignature}'


from jpype import *
import jpype.imports

def createJdbcConnection(accountId, roleId, username, password): 
	jdbcUri = f'jdbc:ns://{accountId.lower().replace("_", "-")}.connect.api.netsuite.com:1708;ServerDataSource=NetSuite2.com;Encrypted=1;CustomProperties=(AccountID={accountId};RoleID={roleId});'
	classPath = '/Users/sdogru/Projects/NetSuiteJDBCDrivers/NQjc.jar'

	jpype.addClassPath(classPath)
	jpype.startJVM()
	jpype.imports.registerDomain("com")

	from com.netsuite.jdbc.openaccess import OpenAccessDriver
	return java.sql.DriverManager.getConnection(jdbcUri, username, password)

