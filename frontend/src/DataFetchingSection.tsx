// import React, { useState } from "react";
// import { Button } from "./components/ui/button";
// import { Input } from "./components/ui/input";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "./components/ui/table";
// import { Loader2 } from "lucide-react";
// import { useAccount, useWriteContract } from "wagmi";
// import { useWriteInputBox } from "./hooks/generated";
// import { OracleCartesiReaderABi } from "./lib/oracleAbi";
// import { Address, Hex, stringToHex } from "viem";

// const DataFetchSection: React.FC = () => {
//   const [dappAddress, setDappAddress] = useState("");
//   const [oracleContract, setOracleContract] = useState("");
//   const [tableData, setTableData] = useState<Array<{ price: string; timestamp: string }>>([]);
//   const [endpoint, setEndpoint] = useState<string>("");

//   const { chain } = useAccount();
//   const { writeContractAsync } = useWriteContract();
//   const { writeContractAsync: writeInputBox, isPending } = useWriteInputBox();

//   const generateMockData = () => ({
//     ethUsdPrice: (Math.random() * 2000 + 1000).toFixed(2),
//     timestamp: Math.floor(Date.now() / 1000),
//   });

//   // First function to handle contract write
//   const handleWriteContract = async () => {
//     try {
//       const mockData = generateMockData();

//       if (chain?.id === 31337) { // Anvil chain ID
//         setEndpoint('http://localhost:8080/graphql');
//         await writeInputBox({
//           functionName: "addInput",
//           args: [dappAddress as Address, stringToHex(JSON.stringify(mockData)) as Hex],
//         });
//       } else if (chain?.id === 11155111) { // Sepolia chain ID
//         console.log("Writing contract to Sepolia");
//         setEndpoint('https://cartesi-chronicle-test.fly.dev/graphql');
//         console.log("Oracle contract address", oracleContract);
//         console.log("dappAddress", dappAddress);
//         await writeContractAsync({
//           abi: OracleCartesiReaderABi,
//           address: oracleContract as Address,
//           functionName: "relayPrice",
//           args: [dappAddress],
//         });
//       } else if (chain?.id === 84532) { // Base Sepolia chain ID
//           console.log("Writing contract to Base Sepolia");
//           setEndpoint('http://192.168.64.4:10011/rpc');
//           console.log("Oracle contract address", oracleContract);
//           console.log("dappAddress", dappAddress);
//           await writeContractAsync({
//             abi: OracleCartesiReaderABi,
//             address: oracleContract as Address,
//             functionName: "relayPrice",
//             args: [dappAddress as Address],
//           });
//       } else {
//         console.error("Unsupported chain");
//         return;
//       }
      
//       alert("Contract writing operation has finished!");

//     } catch (error) {
//       console.error("Error writing contract:", error);
//     }
//   };

//   // helpers
// const hexToUtf8 = (hex: string) => {
//   const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
//   const bytes = clean.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [];
//   return new TextDecoder().decode(new Uint8Array(bytes));
// };

// const hexJsonToObj = (hex: string) => JSON.parse(hexToUtf8(hex));

// type CartesiNotice = {
//   decoded_data?: { payload?: string };
//   raw_data?: string;
//   index?: string;
//   // optional fields omitted
// };

// type CartesiListOutputsResponse = {
//   jsonrpc: "2.0";
//   result?: {
//     data?: CartesiNotice[];
//     pagination?: { total_count: number; limit: number; offset: number };
//   };
//   error?: { code: number; message: string };
//   id: number;
// };

// const handleFetchData = async () => {
//   try {
//     if (!endpoint) {
//      setEndpoint('http://192.168.64.4:10011/rpc');
//       return;
//     }

//     const body = {
//       jsonrpc: "2.0",
//       method: "cartesi_listOutputs", 
//       params: {
//         application: dappAddress,
//         limit: 10,
//         offset: 0,
//       },
//       id: 1,
//     };

//     const res = await fetch(endpoint, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify(body),
//     });

//     const rpc: CartesiListOutputsResponse = await res.json();

//     if (!res.ok || rpc.error) {
//       throw new Error(rpc.error?.message ?? `HTTP ${res.status}`);
//     }

//     const notices = rpc.result?.data ?? [];

//     // Prefer decoded_data.payload (already the pure JSON payload hex).
//     // Fallback to parsing raw_data if decoded_data isn't present.
//     const decodedObjects = notices.map((n) => {
//       const payloadHex = n.decoded_data?.payload;
//       if (!payloadHex) throw new Error("Notice missing decoded_data.payload");
//       return hexJsonToObj(payloadHex);
//     });

//     const filteredDecodedObjects = decodedObjects.filter(obj => obj !== undefined && obj !== null);

//     console.log("Filtered objects from notices:", filteredDecodedObjects);

//     console.log("Decoded objects from notices:", decodedObjects);

//     console.log("Decoded objects from notices:", filteredDecodedObjects[0].ethUsdPrice);

//     setTableData(
//       filteredDecodedObjects.map((decoded: any) => ({
//         price: decoded.ethUsdPrice,
//         timestamp: new Date(Number(decoded.timestamp) * 1000).toLocaleString(),
//       }))
//     );
//   } catch (error) {
//     console.error("Error fetching data:", error);
//   }
// };

//   return (
//     <>
//       <div className="w-full max-w-md mb-8">
//         <Input
//           type="text"
//           placeholder="Enter dApp address"
//           value={dappAddress}
//           onChange={(e) => setDappAddress(e.target.value)}
//           className="mb-4"
//         />
//         <Input
//           type="text"
//           placeholder="Enter OracleCartesiReader contract address"
//           value={oracleContract}
//           onChange={(e) => setOracleContract(e.target.value)}
//           className="mb-4"
//         />
//         <Button
//           onClick={handleWriteContract}
//           className="w-full bg-gray-800 text-white hover:bg-gray-700"
//           disabled={isPending}
//         >
//           {isPending ? (
//             <>
//               <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//               Processing...
//             </>
//           ) : (
//             "Send Oracle Data To Cartesi"
//           )}
//         </Button>
//       </div>

//       <div className="w-full max-w-md mb-8">
//         <Button
//           onClick={handleFetchData}
//           className="w-full bg-gray-800 text-white hover:bg-gray-700"
//         >
//           Fetch Data
//         </Button>
//       </div>

//       <div className="w-full max-w-2xl">
//         <h2 className="text-2xl font-bold text-center mb-4">Recent Oracle Data into Cartesi Node</h2>
//         <Table>
//           <TableHeader>
//             <TableRow>
//               <TableHead>ETH/USD Price</TableHead>
//               <TableHead>Timestamp</TableHead>
//             </TableRow>
//           </TableHeader>
//           <TableBody>
//             {tableData.map((data, index) => (
//               <TableRow key={index}>
//                 <TableCell>${(Number(data.price) / 100000000)}</TableCell>
//                 <TableCell>{data.timestamp}</TableCell>
//               </TableRow>
//             ))}
//           </TableBody>
//         </Table>
//       </div>
//     </>
//   );
// };

// export default DataFetchSection;
