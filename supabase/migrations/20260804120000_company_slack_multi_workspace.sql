begin;

-- One Slack team may back multiple Harper workspaces. Incoming events are
-- routed by the team/channel pair instead of the team alone.
drop index if exists public.company_slack_integrations_active_team_uidx;

alter table public.company_slack_channels
  add column if not exists slack_team_id text;

update public.company_slack_channels channel
set slack_team_id = integration.slack_team_id
from public.company_slack_integrations integration
where integration.company_workspace_id = channel.company_workspace_id
  and channel.slack_team_id is distinct from integration.slack_team_id;

alter table public.company_slack_channels
  alter column slack_team_id set not null;

-- A Slack channel can invoke only one Harper workspace. Without this guard,
-- one app mention could produce replies from multiple company contexts.
create unique index if not exists company_slack_channels_team_channel_uidx
  on public.company_slack_channels(slack_team_id, slack_channel_id);

create index if not exists company_slack_integrations_active_team_idx
  on public.company_slack_integrations(slack_team_id)
  where status = 'active';

comment on table public.company_slack_integrations is
  'One Harper Slack bot OAuth connection per company workspace. A Slack team may connect to multiple company workspaces.';
comment on column public.company_slack_channels.slack_team_id is
  'Slack team owning this channel. Used with slack_channel_id to route events to exactly one Harper workspace.';

commit;
