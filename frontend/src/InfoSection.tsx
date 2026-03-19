import React from "react";

const InfoSection: React.FC = () => {
  return (
    <div className="max-w-2xl text-center mb-8">
      <p className="text-muted-foreground mb-4 text-2xl font-bold text-center black mb-10">
        Create tokens and simulate buys and sells to see how price changes on a Bancor style bonding curve.
      </p>
      <ul className="text-md text-muted-foreground list-disc list-inside space-y-1 mb-6">
        <li>Enter your DApp address and Rollup RPC URL, then click &quot;Refresh notices&quot;</li>
        <li>Create a token with initial supply, price, and reserve balance</li>
        <li>Select a token to view details and its price curve</li>
        <li>Run a simulation (number of buys/sells and amount ranges) and see the updated chart</li>
      </ul>
    </div>
  );
};

export default InfoSection;
