import { readFile } from "node:fs/promises";
import {
  setup as setupSchedules,
  localAdmin as schedulesAdmin,
} from "../schedules/testSupport";
export { owner, other, role, roleTwo } from "../schedules/testSupport";

// Hosted schema inspected read-only on 2026-11-02. Transport effects are captured locally.
export async function setupMeetings() {
  const db = await setupSchedules();
  await db.exec(`
    create table meeting_schedules(id uuid primary key default gen_random_uuid(), talent_id uuid not null references talent_users(user_id),
      role_id uuid not null references company_roles(role_id),company_workspace_id uuid not null,organizer_company_user_id uuid not null,
      recommendation_id uuid not null,active_round_id uuid,company_attendees jsonb not null default '[]',
      title text not null,confirmed_start_at timestamptz,confirmed_end_at timestamptz,status text not null default 'preparing',
      version bigint not null default 1,updated_at timestamptz not null default now(),duration_minutes integer not null default 60,
      idempotency_key text unique not null,
      constraint meeting_schedules_title_length_check check(length(title) between 1 and 200),
      constraint meeting_schedules_duration_check check(duration_minutes between 15 and 240 and duration_minutes%15=0));
    create table meeting_test_effects(kind text, schedule_id uuid);
    create function enforce_confirmed_meeting_calendar_busy_v1() returns trigger language plpgsql as $$ begin
      if new.status='confirmed' then
        if new.confirmed_start_at is null or new.confirmed_end_at is null then raise exception 'confirmed meeting requires a time range'; end if;
        insert into meeting_test_effects values('busy',new.id);
      end if; return new; end $$;
    create function initialize_meeting_schedule_calendar_event_v1() returns trigger language plpgsql as $$ begin
      if new.status='confirmed' then insert into meeting_test_effects values('calendar',new.id); end if; return new; end $$;
    create function company_followup_source_changed_v1() returns trigger language plpgsql as $$ begin
      insert into meeting_test_effects values('company_followup',new.id); return new; end $$;
    create trigger meeting_schedules_calendar_busy_insert_v1 before insert on meeting_schedules for each row execute function enforce_confirmed_meeting_calendar_busy_v1();
    create trigger meeting_schedules_calendar_busy_update_v1 before update of status,confirmed_start_at,confirmed_end_at on meeting_schedules for each row execute function enforce_confirmed_meeting_calendar_busy_v1();
    create trigger meeting_schedules_calendar_event_initialize_v1 after insert or update of status on meeting_schedules for each row execute function initialize_meeting_schedule_calendar_event_v1();
    create trigger company_meeting_followup_parent after update of status,active_round_id on meeting_schedules for each row execute function company_followup_source_changed_v1();
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../../../supabase/migrations/20261102081607_career_meeting_schedules.sql",
        import.meta.url
      ),
      "utf8"
    )
  );
  return db;
}

/** Actual SQL RPCs and owned appointment reads; other tables use the existing schedule adapter. */
export function meetingAdmin(
  db: Awaited<ReturnType<typeof setupMeetings>>
): any {
  const base = schedulesAdmin(db);
  return {
    ...base,
    from(table: string) {
      if (table !== "meeting_schedules") return base.from(table);
      const clauses: string[] = [],
        values: unknown[] = [],
        orders: string[] = [];
      let offset = 0,
        limit = 30;
      const allowed = new Set([
        "id",
        "talent_id",
        "role_id",
        "source_key",
        "status",
        "confirmed_start_at",
      ]);
      const filter = (key: string, operator: string, value: unknown) => {
        if (!allowed.has(key)) throw new Error("Unexpected test filter");
        values.push(value);
        clauses.push(`${key} ${operator} $${values.length}`);
        return q;
      };
      const q: any = {
        select: () => q,
        eq: (key: string, value: unknown) => filter(key, "=", value),
        gte: (key: string, value: unknown) => filter(key, ">=", value),
        or(expression: string) {
          const alternatives = expression.split(",").map((term) => {
            const [key, value] = term.split(".gte.");
            if (
              !value ||
              (key !== "confirmed_start_at" &&
                key !== "source_refs->>calendarDate")
            )
              throw new Error("Unexpected test OR filter");
            values.push(value);
            return `${key === "confirmed_start_at" ? key : "source_refs->>'calendarDate'"} >= $${values.length}`;
          });
          clauses.push(`(${alternatives.join(" or ")})`);
          return q;
        },
        lt: (key: string, value: unknown) => filter(key, "<", value),
        in(key: string, items: unknown[]) {
          values.push(items);
          clauses.push(`${key} = any($${values.length})`);
          return q;
        },
        order(key: string) {
          if (!allowed.has(key)) throw new Error("Unexpected test ordering");
          orders.push(key);
          return q;
        },
        range(start: number, end: number) {
          offset = start;
          limit = end - start + 1;
          return q;
        },
        async execute() {
          const where = clauses.length ? ` where ${clauses.join(" and ")}` : "";
          const rows = (
            await db.query<any>(
              `select * from meeting_schedules${where}${orders.length ? ` order by ${orders.join(",")}` : ""}`,
              values
            )
          ).rows;
          return {
            data: rows.slice(offset, offset + limit),
            error: null,
            count: rows.length,
          };
        },
        then(resolve: any, reject: any) {
          return q.execute().then(resolve, reject);
        },
      };
      return q;
    },
  };
}
