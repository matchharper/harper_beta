-- One-sided salary disclosure is incomplete evidence, not a full band.
-- Shared utility for both legacy and hybrid external retrieval. ECB 2026-10-14.
create or replace function public.external_role_salary_satisfaction(p_min numeric,p_max numeric,p_currency text,p_period text,p_target_krw numeric)
returns numeric language sql immutable parallel safe security invoker set search_path='' as $$
 with units as (select ('{"USD":1336.7932112550245,"JPY":8.436439483623655,"CZK":61.44188528964979,"DKK":200.19530727452712,"GBP":1773.466848373526,"HUF":4.119295348197082,"PLN":342.7871180539649,"RON":280.0306874742712,"SEK":134.12260261695644,"CHF":1604.0085744908895,"ISK":10.971700879765395,"NOK":141.136417220729,"TRY":27.066072730100682,"AUD":937.0358775280196,"BRL":266.07047612274647,"CAD":940.155798467144,"CNY":199.7384050717384,"HKD":170.3342856167268,"IDR":0.07459326201348077,"ILS":434.4975757047876,"INR":14.048285760685188,"KRW":1.0,"MXN":72.78891050583658,"MYR":327.44179940486606,"NZD":750.4839275863798,"PHP":21.259784353557883,"SGD":1042.231353158298,"THB":39.81536169420278,"ZAR":81.16518966059594,"EUR":1496.54}'::jsonb->>upper(p_currency))::numeric as rate,
  case lower(p_period) when 'year' then 1 when 'yearly' then 1 when 'annual' then 1 when 'annually' then 1 when 'month' then 12 when 'monthly' then 12 end as period),
 band as (select coalesce(p_min,p_max)*rate*period as lo,coalesce(p_max,p_min)*rate*period as hi from units)
 select case when p_target_krw is null or p_target_krw<=0 or lo is null or hi is null or lo<=0 or hi<lo or lo='NaN'::numeric or hi='NaN'::numeric or hi='Infinity'::numeric then 0.5
  when p_max is null then case when lo>=p_target_krw then 1 else 0.5 end
  when p_min is null then case when hi<p_target_krw then 0.5*power(hi/p_target_krw,2) else 0.5 end
  when lo>=p_target_krw then 1
  when lo=hi then least(1,power(lo/p_target_krw,2))
  else ((case when hi<=p_target_krw then power(hi,3)/(3*power(p_target_krw,2)) else hi-2*p_target_krw/3 end)-power(lo,3)/(3*power(p_target_krw,2)))/(hi-lo) end from band
$$;
revoke all on function public.external_role_salary_satisfaction(numeric,numeric,text,text,numeric) from public,anon,authenticated;
grant execute on function public.external_role_salary_satisfaction(numeric,numeric,text,text,numeric) to service_role;
