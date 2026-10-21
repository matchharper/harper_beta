import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthApiError,
  type Session,
  type AuthChangeEvent,
} from "@supabase/supabase-js";
import { JSDOM } from "jsdom";
import {
  AUTH_PERSONA_STORAGE_KEY,
  parseAuthPersona,
  serializeAuthPersona,
} from "@/lib/authSessionPersona";

test("login persona follows session changes, other tabs, and successful logout only", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  const { supabase } = await import("@/lib/supabase");
  const { useAuthStore } = await import("./useAuthStore");
  const dom = new JSDOM("", { url: "http://localhost" });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  t.after(() => {
    dom.window.close();
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  const makeSession = (id: string, expiresAt = 100) =>
    ({
      user: { id: "dual-account", email: "fixture@example.test" },
      access_token: `header.${Buffer.from(
        JSON.stringify({ session_id: id, exp: expiresAt })
      ).toString("base64url")}.signature`,
    }) as Session;
  const initial = makeSession("original-login");
  let onAuthChange!: (event: AuthChangeEvent, session: Session | null) => void;
  t.mock.method(supabase.auth, "getSession", async () => ({
    data: { session: initial },
    error: null,
  }));
  t.mock.method(
    supabase.auth,
    "onAuthStateChange",
    (listener: typeof onAuthChange) => {
      onAuthChange = listener;
      return { data: { subscription: { unsubscribe() {} } } };
    }
  );
  await useAuthStore.getState().init();
  assert.equal(useAuthStore.getState().persona, null);
  useAuthStore.getState().initializeLoginPersona("company");
  assert.equal(useAuthStore.getState().persona, "company");
  assert.equal(
    parseAuthPersona(
      dom.window.localStorage.getItem(AUTH_PERSONA_STORAGE_KEY),
      initial
    ),
    "company",
    "existing sessions persist the first workspace without signing in again"
  );
  useAuthStore.getState().initializeLoginPersona("talent");
  assert.equal(
    useAuthStore.getState().persona,
    "company",
    "visiting the other workspace cannot overwrite an established login type"
  );
  useAuthStore.setState({ persona: null });
  await useAuthStore.getState().init();
  assert.equal(useAuthStore.getState().persona, "company");

  onAuthChange("TOKEN_REFRESHED", makeSession("original-login", 200));
  assert.equal(useAuthStore.getState().persona, "company");
  dom.window.localStorage.setItem(
    AUTH_PERSONA_STORAGE_KEY,
    serializeAuthPersona(initial, "talent")!
  );
  dom.window.dispatchEvent(
    new dom.window.StorageEvent("storage", { key: AUTH_PERSONA_STORAGE_KEY })
  );
  assert.equal(useAuthStore.getState().persona, "talent");

  const next = makeSession("new-login");
  onAuthChange("INITIAL_SESSION", next);
  assert.equal(
    useAuthStore.getState().persona,
    null,
    "new logins cannot inherit an old persona"
  );
  useAuthStore.getState().setLoginPersona(next, "company");
  assert.equal(useAuthStore.getState().persona, "company");

  const signOut = t.mock.method(supabase.auth, "signOut", async () => ({
    error: new AuthApiError("Temporary failure", 500, undefined),
  }));
  await assert.rejects(
    useAuthStore.getState().signOut({ scope: "local" }),
    /Temporary failure/
  );
  assert.equal(useAuthStore.getState().session, next);
  assert.equal(useAuthStore.getState().persona, "company");

  signOut.mock.mockImplementation(async () => {
    onAuthChange("SIGNED_OUT", null);
    return { error: null };
  });
  await useAuthStore.getState().signOut({ scope: "local" });
  assert.deepEqual(signOut.mock.calls.at(-1)?.arguments, [{ scope: "local" }]);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().persona, null);
  assert.equal(dom.window.localStorage.getItem(AUTH_PERSONA_STORAGE_KEY), null);
});

test("first workspace adoption handles either persona and respects existing sessions", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  const { useAuthStore } = await import("./useAuthStore");
  const previousState = useAuthStore.getState();
  const dom = new JSDOM("", { url: "http://localhost" });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: dom.window,
  });
  t.after(() => {
    useAuthStore.setState(previousState);
    dom.window.close();
    if (previousWindow)
      Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const session = {
    user: { id: "existing-account" },
    access_token: `header.${Buffer.from(
      JSON.stringify({ session_id: "existing-login" })
    ).toString("base64url")}.signature`,
  } as Session;

  for (const firstPersona of ["talent", "company"] as const) {
    const otherPersona = firstPersona === "talent" ? "company" : "talent";
    dom.window.localStorage.clear();
    useAuthStore.setState({
      session,
      user: session.user,
      persona: null,
      loading: true,
    });
    useAuthStore.getState().initializeLoginPersona(firstPersona);
    assert.equal(useAuthStore.getState().persona, null);

    useAuthStore.setState({ loading: false });
    useAuthStore.getState().initializeLoginPersona(firstPersona);
    assert.equal(useAuthStore.getState().persona, firstPersona);
    assert.equal(useAuthStore.getState().session, session);

    // Simulate a new tab whose in-memory state has not received the saved binding.
    useAuthStore.setState({ persona: null });
    useAuthStore.getState().initializeLoginPersona(otherPersona);
    assert.equal(useAuthStore.getState().persona, firstPersona);
    assert.equal(
      parseAuthPersona(
        dom.window.localStorage.getItem(AUTH_PERSONA_STORAGE_KEY),
        session
      ),
      firstPersona
    );
  }

  useAuthStore.setState({ session: null, user: null, persona: null });
  useAuthStore.getState().initializeLoginPersona("talent");
  assert.equal(useAuthStore.getState().persona, null);
});
