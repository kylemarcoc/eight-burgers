import { ApiLoadingIndicator } from './components/ApiLoadingIndicator';
import { QueryProvider } from './providers/QueryProvider';
import AppRouter from './router';

function App() {
  return (
    <QueryProvider>
      <ApiLoadingIndicator />
      <AppRouter />
    </QueryProvider>
  );
}

export default App;
