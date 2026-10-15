import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { orgBootstrapQueryOptions, refreshOrgWorkspaceData } from "./useOrg";
import type { OrgBootstrapResponse } from "@/lib/org/server";

test("directory refresh updates active and inactive consumers and cancels pre-mutation reads", async () => {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const getSession = supabase.auth.getSession;
  const fetch = globalThis.fetch;
  const stale = {workspace:{workspaceId:"w"},members:[{userId:"person",authority:"owner"}],teams:[]} as unknown as OrgBootstrapResponse;
  const fresh = {...stale,members:[{userId:"person",authority:"viewer"}],teams:[{teamId:"new",name:"New Team"}]} as unknown as OrgBootstrapResponse;
  let aborted = false;
  let readStarted!: () => void;
  const started = new Promise<void>(resolve => {readStarted=resolve;});
  let releaseOld!: () => void;
  let calls=0;
  (supabase.auth as any).getSession=async()=>({data:{session:{access_token:"synthetic"}}});
  globalThis.fetch=async (_input,init)=>{
    if (++calls===1) {
      readStarted();
      init?.signal?.addEventListener("abort",()=>{aborted=true;});
      await new Promise<void>(resolve=>{releaseOld=resolve;});
      return Response.json(stale);
    }
    return Response.json(fresh);
  };
  client.setQueryData(queryKeys.org.bootstrap("w"),stale);
  client.setQueryData(queryKeys.org.bootstrap(""),stale);
  const observer=new QueryObserver(client,orgBootstrapQueryOptions({orgId:"w"}));
  const unsubscribe=observer.subscribe(()=>{});
  try {
    const oldRead=client.fetchQuery({...orgBootstrapQueryOptions({orgId:"w"}),staleTime:0}).catch(()=>{});
    await started;
    await refreshOrgWorkspaceData(client,"w");
    assert.equal(aborted,true);
    assert.deepEqual(observer.getCurrentResult().data?.teams,fresh.teams);
    assert.equal(observer.getCurrentResult().data?.members[0].authority,"viewer");
    assert.deepEqual(client.getQueryData(queryKeys.org.bootstrap("")),fresh);
    releaseOld(); await oldRead;
    assert.deepEqual(client.getQueryData(queryKeys.org.bootstrap("w")),fresh);
  } finally {
    releaseOld?.(); unsubscribe(); client.clear(); globalThis.fetch=fetch; supabase.auth.getSession=getSession;
  }
});
