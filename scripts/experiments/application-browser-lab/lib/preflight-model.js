// Keep provider accounting separate from SDK summaries, which can omit raw cache usage.
export function preflightModel(modelName,evidence,env=process.env){
  const openai=modelName==='openai/gpt-6-luna';
  const middleware={
    ...(openai?{transformParams:async({params})=>{
      const {temperature,topP,...rest}=params;
      return {...rest,maxOutputTokens:128000,providerOptions:{...rest.providerOptions,openai:{...rest.providerOptions?.openai,store:false,reasoningEffort:'medium'}}};
    }}:{}),
    wrapGenerate:async({doGenerate})=>{
      const r=await doGenerate();evidence.llmCalls.push({usage:r.usage,providerMetadata:r.providerMetadata,finishReason:r.finishReason});return r;
    },
  };
  return {modelName,apiKey:openai?env.OPENAI_API_KEY:env.ANTHROPIC_API_KEY,middleware,...(openai?{fetch:async(url,options)=>{
    const started=Date.now();const r=await fetch(url,options);
    const j=await r.clone().json().catch(()=>null);
    evidence.providerCalls.push({endpoint:new URL(String(url)).pathname,status:r.status,elapsedMs:Date.now()-started,model:j?.model,usage:j?.usage,error:j?.error?.message});
    return r;
  }}:{})};
}
