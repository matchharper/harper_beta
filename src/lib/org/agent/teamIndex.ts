import type { User } from '@supabase/supabase-js';
import type { OrgAgentAdminClient } from './data';
import { readOrgRoleAccess } from '../teamAccess';

/** Entity discovery is independent of assigned people, Roles or saved Memory. */
export async function readCompanyTeams(args: {admin:OrgAgentAdminClient;user:User;workspaceId:string}) {
  const access=await readOrgRoleAccess(args);
  const items:Array<{teamId:string;name:string}>=[];
  if(access.scope!=='organization'&&!access.teamIds.length)return items;
  for(let offset=0;;offset+=1000){
    let query=(args.admin.from('company_workspace_teams' as any) as any)
      .select('id,name').eq('company_workspace_id',args.workspaceId).is('deleted_at',null);
    if(access.scope!=='organization')query=query.in('id',access.teamIds);
    const {data,error}=await query.order('id').range(offset,offset+999);
    if(error)throw error;
    items.push(...(data??[]).map((row:{id:string;name:string})=>({teamId:row.id,name:row.name})));
    if((data??[]).length<1000)return items;
  }
}
