// The hosted executor requires outbound traffic through its HTTP CONNECT proxy.
// Undici covers fetch; Stagehand v3's ws client needs an explicit request agent.
const https = require("node:https");
const { EnvHttpProxyAgent, setGlobalDispatcher } = require("undici");
const { HttpsProxyAgent } = require("https-proxy-agent");
setGlobalDispatcher(new EnvHttpProxyAgent());
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
if (proxy) {
  const agent = new HttpsProxyAgent(proxy);
  const request = https.request;
  https.request = function (options, ...rest) {
    if (options?.headers?.Upgrade === "websocket" && !options.agent)
      options = { ...options, agent };
    return request.call(this, options, ...rest);
  };
}
