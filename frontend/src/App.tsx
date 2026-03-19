
import Header from './Header'
import LandingPage from './LandingPage'


import { useAccount } from 'wagmi';




function App() {

  const { isConnected } = useAccount();
  
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Header />
      <LandingPage isConnected={isConnected} />
    </div>
  )
}

export default App
