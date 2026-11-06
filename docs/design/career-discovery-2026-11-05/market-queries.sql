-- Read-only extracts, 2026-11-05, Harper project zzojrniuppueizhnmqfd.

with topics(ord,id,label,pattern) as (values (0,'backend','백엔드','(백엔드|백앤드|back.?end)'),(1,'frontend','프론트엔드','(프론트엔드|front.?end)'),(2,'ml','AI · 머신러닝','(머신러닝|machine learning|\mAI\M|\mML\M)'),(3,'data','데이터','(데이터|data (engineer|analyst|scientist))'),(4,'pm','서비스 · 제품 기획','(서비스.?기획|프로덕트.?매니저|product manager|\mPM\M|\mPO\M)'),(5,'design','디자인','(디자인|디자이너|designer)'),(6,'marketing','마케팅','(마케팅|marketer|marketing|그로스)'),(7,'sales','영업 · 세일즈','(영업|세일즈|sales|account executive)'),(8,'hr','HR · 채용','(인사|리크루터|채용.?담당|recruiter|\mHR\M|human resources)'),(9,'finance','재무 · 회계','(재무|회계|finance|accountant)'),(10,'mobile','모바일 개발','(안드로이드|android|\miOS\M|플러터|flutter|모바일.?개발)'),(11,'infra','인프라 · 보안','(devops|\mSRE\M|인프라|보안|security|시스템.?엔지니어)')), base as (
 select r.*, (salary_min+salary_max)/2 as pay,
 salary_is_predicted and salary_currency='KRW' and salary_period='year' and salary_min>0 and salary_max>=salary_min as has_pay
 from company_roles r where r.source_type='external' and r.country_code='KR' and r.source_provider='zighang' and r.information->>'testOnly' is distinct from 'true'
), matched as (
 select b.*,t.id,t.label,t.ord from base b join lateral (select * from topics where b.name~*pattern order by ord limit 1) t on true
)
select id,label,ord,count(*) filter(where is_expired is not true) active,
count(*) filter(where posted_at>='2026-09-07 00:00:00+09' and posted_at<'2026-10-05 00:00:00+09') prev_n,
count(*) filter(where posted_at>='2026-10-05 00:00:00+09' and posted_at<'2026-11-02 00:00:00+09') now_n,
count(distinct company_workspace_id) filter(where posted_at>='2026-10-05 00:00:00+09' and posted_at<'2026-11-02 00:00:00+09') companies,
count(*) filter(where has_pay and posted_at>='2026-09-07 00:00:00+09' and posted_at<'2026-10-05 00:00:00+09') prev_pay_n,
count(*) filter(where has_pay and posted_at>='2026-10-05 00:00:00+09' and posted_at<'2026-11-02 00:00:00+09') now_pay_n,
round(avg(pay) filter(where has_pay and posted_at>='2026-09-07 00:00:00+09' and posted_at<'2026-10-05 00:00:00+09')) prev_pay,
round(avg(pay) filter(where has_pay and posted_at>='2026-10-05 00:00:00+09' and posted_at<'2026-11-02 00:00:00+09')) now_pay,
percentile_cont(array[0.1,0.25,0.5,0.75,0.9]) within group(order by pay) filter(where has_pay and posted_at>='2026-10-05 00:00:00+09' and posted_at<'2026-11-02 00:00:00+09') pay_percentiles
from matched group by id,label,ord order by ord;

with topics(ord,id,label,pattern) as (values (0,'backend','백엔드','(백엔드|백앤드|back.?end)'),(1,'frontend','프론트엔드','(프론트엔드|front.?end)'),(2,'ml','AI · 머신러닝','(머신러닝|machine learning|\mAI\M|\mML\M)'),(3,'data','데이터','(데이터|data (engineer|analyst|scientist))'),(4,'pm','서비스 · 제품 기획','(서비스.?기획|프로덕트.?매니저|product manager|\mPM\M|\mPO\M)'),(5,'design','디자인','(디자인|디자이너|designer)'),(6,'marketing','마케팅','(마케팅|marketer|marketing|그로스)'),(7,'sales','영업 · 세일즈','(영업|세일즈|sales|account executive)'),(8,'hr','HR · 채용','(인사|리크루터|채용.?담당|recruiter|\mHR\M|human resources)'),(9,'finance','재무 · 회계','(재무|회계|finance|accountant)'),(10,'mobile','모바일 개발','(안드로이드|android|\miOS\M|플러터|flutter|모바일.?개발)'),(11,'infra','인프라 · 보안','(devops|\mSRE\M|인프라|보안|security|시스템.?엔지니어)')), base as (
 select r.*, (salary_min+salary_max)/2 as pay,
 salary_is_predicted and salary_currency='KRW' and salary_period='year' and salary_min>0 and salary_max>=salary_min as has_pay
 from company_roles r where source_type='external' and country_code='KR' and source_provider='zighang' and information->>'testOnly' is distinct from 'true'
), matched as (select b.*,t.id,t.label,t.ord from base b join lateral(select * from topics where b.name~*pattern order by ord limit 1) t on true) select id,date_trunc('week',posted_at at time zone 'Asia/Seoul')::date week,count(*) n,count(*) filter(where has_pay) pay_n,round(avg(pay) filter(where has_pay)) pay from matched where posted_at>='2026-09-07 00:00:00+09' and posted_at<'2026-11-02 00:00:00+09' group by 1,2 order by 1,2;

select source_provider,count(*) n,count(distinct company_workspace_id) companies,count(*) filter(where salary_is_predicted) predicted from company_roles where source_type='external' and country_code='KR' and source_provider='zighang' and information->>'testOnly' is distinct from 'true' and posted_at>='2026-10-05 00:00:00+09' and posted_at<'2026-11-02 00:00:00+09' group by 1;
