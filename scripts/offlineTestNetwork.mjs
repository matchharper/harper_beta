// Preload only for synthetic regression tests. Individual tests may replace
// fetch with their own mocks; the default never reaches a real service.
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url
  );
  if (
    url.protocol === "http:" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    return nativeFetch(input, init);
  return Promise.reject(
    new Error(`Offline regression blocked external request: ${url.hostname}`)
  );
};
