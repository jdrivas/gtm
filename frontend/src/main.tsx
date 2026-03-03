import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import './index.css'
import App from './App.tsx'

// Runtime config injected by the server into index.html, with fallback
// to Vite env vars for local `vite dev` workflow.
const gtmConfig = (window as any).__GTM_CONFIG__ || {
  auth0_domain: import.meta.env.VITE_AUTH0_DOMAIN,
  auth0_client_id: import.meta.env.VITE_AUTH0_CLIENT_ID,
  auth0_audience: import.meta.env.VITE_AUTH0_AUDIENCE,
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={gtmConfig.auth0_domain}
      clientId={gtmConfig.auth0_client_id}
      authorizationParams={{
        redirect_uri: window.location.origin,
        audience: gtmConfig.auth0_audience,
      }}
      cacheLocation="localstorage"
      useRefreshTokens={true}
    >
      <App />
    </Auth0Provider>
  </StrictMode>,
)
