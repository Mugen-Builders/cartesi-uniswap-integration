# Mounting the Frontend

Follow these steps to set up and run the frontend application:

1. **Navigate to Frontend Directory**
   ```
   cd frontend
   ```

2. **Install Frontend Dependencies**
   ```
   npm install
   ```

3. **Configure WalletConnect and RPC URLs**
   - Copy `.env.example` to `.env.local` and fill in your secrets.
   - At a minimum you need:
     ```
     VITE_WC_PROJECT_ID=your-walletconnect-project-id
     VITE_RPC_URL=https://your.preferred.rpc
     VITE_RPC_URL_11155111=https://your.rpc.for.sepolia
     ```
   - `VITE_RPC_URL_<chainId>` (e.g. `11155111` for Sepolia) overrides the default RPC for that chain; use `VITE_RPC_URL` for a global fallback.
   - If neither env var exists, the frontend will fall back to the chain’s built-in URL (Sepolia defaults to `https://rpc.sepolia.org`).

4. **Update Contract Address**
   - In your frontend code, locate the part where the contract address is defined.
   - Replace the placeholder address with the actual address of the deployed `OracleCartesiReader` contract on Sepolia.

   > Important: Ensure you use the correct contract address to enable proper interaction between the frontend and the smart contract.

5. **Confirm Library Versions**
   - This frontend is currently wired up with `wagmi@2.12.5` and `viem@2.19.4` (see `package.json` / `npm ls` for the exact versions your install pulls in).
   - Run `npm ls wagmi viem` if you need to prove the versions for debugging or compatibility checks.

6. **Run the Frontend**
   ```
   npm run dev
   ```
   This command will launch the React application that interacts with your deployed smart contract.

> Note: Make sure your backend node is running before starting the frontend application for full functionality.