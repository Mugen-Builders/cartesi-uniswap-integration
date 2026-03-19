import React from "react";
import { Button } from "./components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./components/ui/popover";
import { ChevronDown } from "lucide-react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";

const Header: React.FC = () => {
  const { address, isConnected, chain } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { chains, switchChain } = useSwitchChain();

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <header className="border-b border-border bg-card px-4 py-3 flex justify-between items-center">
      <div className="text-xl font-bold">
        Uniswap V4 Integration
      </div>
      <div>
        {isConnected ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {chain?.name || "Unknown"} – {shortenAddress(address || "")}
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56">
              {chains.map((c) => (
                <Button
                  key={c.id}
                  onClick={() => switchChain({ chainId: c.id })}
                  className="w-full justify-start mb-2"
                  variant="outline"
                >
                  Switch to {c.name}
                </Button>
              ))}
              <Button
                onClick={() => disconnect()}
                className="w-full justify-start"
                variant="outline"
              >
                Disconnect
              </Button>
            </PopoverContent>
          </Popover>
        ) : (
          <Button onClick={() => connect({ connector: connectors[0] })}>
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  );
};

export default Header;
