export const OracleCartesiReaderABi = [
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "dappAddress",
				"type": "address"
			}
		],
		"name": "relayPrice",
		"outputs": [
			{
				"internalType": "bytes32",
				"name": "",
				"type": "bytes32"
			}
		],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "_inputBoxAddress",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_chronicleAddress",
				"type": "address"
			},
			{
				"internalType": "address",
				"name": "_selfKisserAddress",
				"type": "address"
			}
		],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"inputs": [],
		"name": "chronicle",
		"outputs": [
			{
				"internalType": "contract IChronicle",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "inputBox",
		"outputs": [
			{
				"internalType": "contract IInputBox",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "read",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "val",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "age",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "selfKisser",
		"outputs": [
			{
				"internalType": "contract ISelfKisser",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]