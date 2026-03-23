import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { AuthProvider } from "@/contexts/AuthContext";
import NotFound from "@/pages/not-found";

import Home from "@/pages/Home";
import Matches from "@/pages/Matches";
import MatchDetail from "@/pages/MatchDetail";
import FixtureDetail from "@/pages/FixtureDetail";
import Players from "@/pages/Players";
import PlayerDetail from "@/pages/PlayerDetail";
import Odds from "@/pages/Odds";
import AiPredictions from "@/pages/AiPredictions";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Pricing from "@/pages/Pricing";
import Privacy from "@/pages/Privacy";
import SubscriptionSuccess from "@/pages/SubscriptionSuccess";
import ValueBets from "@/pages/ValueBets";
import TopPlayers from "@/pages/TopPlayers";
import DailyAnalysis from "@/pages/DailyAnalysis";
import StatsRankings from "@/pages/StatsRankings";
import BetSimulator from "@/pages/BetSimulator";
import AiPerformance from "@/pages/AiPerformance";
import SeoLiveMatches from "@/pages/seo/LiveMatches";
import SeoTodayBets from "@/pages/seo/TodayBets";
import SeoTodayPredictions from "@/pages/seo/TodayPredictions";
import SeoMatchPrediction from "@/pages/seo/MatchPrediction";
import SeoTeamPage from "@/pages/seo/TeamPage";
import SeoPlayerPage from "@/pages/seo/PlayerPage";
import SeoH2H from "@/pages/seo/H2H";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 2 * 60 * 1000,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        {/* Core pages */}
        <Route path="/" component={Home} />
        <Route path="/matches" component={Matches} />
        <Route path="/matches/:id" component={MatchDetail} />
        <Route path="/fixture/:id" component={FixtureDetail} />
        <Route path="/match/:id" component={FixtureDetail} />
        <Route path="/analysis" component={DailyAnalysis} />
        <Route path="/players" component={Players} />
        <Route path="/players/:id" component={PlayerDetail} />
        <Route path="/top-players" component={TopPlayers} />
        <Route path="/odds" component={Odds} />
        <Route path="/ai" component={AiPredictions} />
        <Route path="/value-bets" component={ValueBets} />
        <Route path="/rankings" component={StatsRankings} />
        <Route path="/bet-simulator" component={BetSimulator} />
        <Route path="/ai-performance" component={AiPerformance} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/subscription/success" component={SubscriptionSuccess} />

        {/* SEO pages */}
        <Route path="/jogos-ao-vivo" component={SeoLiveMatches} />
        <Route path="/melhores-apostas-hoje" component={SeoTodayBets} />
        <Route path="/palpites-hoje" component={SeoTodayPredictions} />
        <Route path="/palpites/:match" component={SeoMatchPrediction} />
        <Route path="/time/:team" component={SeoTeamPage} />
        <Route path="/jogador/:player" component={SeoPlayerPage} />
        <Route path="/h2h/:match" component={SeoH2H} />

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
