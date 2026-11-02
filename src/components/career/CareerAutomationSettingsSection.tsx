import { useCallback, useEffect, useState } from 'react';
import { useCareerApi } from '@/hooks/career/useCareerApi';
import { useCareerT } from '@/i18n/useCareerT';
import { Button } from '@/components/ui/button';
import type { CareerSchedule } from '@/lib/career/schedules/server';
import type { CompanyFollow } from '@/lib/career/companies/server';

export function CareerAutomationSettingsSection() {
  const t = useCareerT(), { fetchWithAuth } = useCareerApi();
  const [schedules, setSchedules] = useState<CareerSchedule[]>([]);
  const [follows, setFollows] = useState<CompanyFollow[]>([]);
  const [scheduleOffset, setScheduleOffset] = useState<number | null>(null);
  const [followOffset, setFollowOffset] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const scheduleStatus = (item: CareerSchedule) => {
    if (item.status === 'active' && item.next_run_at) return new Intl.DateTimeFormat(undefined, { timeZone: item.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.next_run_at));
    if (item.status === 'paused') return t('career.automation.paused', '일시 중지');
    if (item.status === 'cancelled' || item.last_run?.status === 'cancelled') return t('career.automation.cancelled', '취소됨');
    if (item.status === 'triggered' && item.last_run?.status === 'failed') return t('career.automation.failed', '실행 실패');
    if (item.status === 'triggered' && item.last_run?.status !== 'completed') return t('career.automation.in_progress', '진행 중');
    return t('career.automation.completed', '완료');
  };
  const load = useCallback(async () => {
    setError('');
    try {
      const responses = await Promise.all([fetchWithAuth('/api/talent/career-schedules'), fetchWithAuth('/api/talent/career-company-follows')]);
      const [savedSchedules, savedFollows] = await Promise.all(responses.map(response => response.json()));
      if (!responses[0].ok || !responses[1].ok) throw new Error(savedSchedules.error ?? savedFollows.error);
      setSchedules(savedSchedules.schedules); setScheduleOffset(savedSchedules.nextOffset);
      setFollows(savedFollows.follows); setFollowOffset(savedFollows.nextOffset);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [fetchWithAuth]);
  useEffect(() => { void load(); }, [load]);
  const mutate = async (kind: 'schedule' | 'follow', id: string, revision: number, action: string) => {
    setBusy(id); setError('');
    try {
      const response = await fetchWithAuth(kind === 'schedule' ? '/api/talent/career-schedules' : '/api/talent/career-company-follows', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: crypto.randomUUID(), action, expected_revision: revision, [kind === 'schedule' ? 'schedule_id' : 'follow_id']: id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  };
  const loadMore = async (kind: 'schedule' | 'follow') => {
    const offset = kind === 'schedule' ? scheduleOffset : followOffset;
    if (offset === null) return;
    setBusy(kind);
    try {
      const response = await fetchWithAuth(`/api/talent/${kind === 'schedule' ? 'career-schedules' : 'career-company-follows'}?offset=${offset}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      if (kind === 'schedule') { setSchedules(rows => [...rows, ...payload.schedules]); setScheduleOffset(payload.nextOffset); }
      else { setFollows(rows => [...rows, ...payload.follows]); setFollowOffset(payload.nextOffset); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(null); }
  };
  if (loading) return <p className="text-sm text-neutral-muted">{t('career.automation.loading', '불러오는 중…')}</p>;
  return <div className="space-y-8">
    {error && <p role="alert" className="text-sm text-critical">{error}</p>}
    <section>
      <h3 className="mb-3 text-sm font-medium text-neutral-primary">{t('career.automation.schedules', '예약된 작업')}</h3>
      {!schedules.length && <p className="text-sm text-neutral-muted">{t('career.automation.no_schedules', '예약된 작업이 없습니다.')}</p>}
      <div className="divide-y divide-neutral-300">
        {schedules.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
          <details className="min-w-0 flex-1"><summary className="cursor-pointer text-sm text-neutral-primary">{item.title}</summary>
            <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-muted">{item.instruction}</p>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-neutral-muted">{scheduleStatus(item)}</span>
            {item.status === 'active' && <Button size="sm" disabled={busy === item.id} onClick={() => void mutate('schedule', item.id, item.revision, 'pause')}>{t('career.automation.pause', '중지')}</Button>}
            {item.status === 'paused' && <Button size="sm" disabled={busy === item.id} onClick={() => void mutate('schedule', item.id, item.revision, 'resume')}>{t('career.automation.resume', '재개')}</Button>}
            {['active', 'paused', 'triggered'].includes(item.status) && <Button size="sm" disabled={busy === item.id} onClick={() => void mutate('schedule', item.id, item.revision, 'cancel')}>{t('career.automation.cancel', '취소')}</Button>}
          </div>
        </div>)}
      </div>
      {scheduleOffset !== null && <Button size="sm" disabled={busy === 'schedule'} onClick={() => void loadMore('schedule')}>{t('career.automation.more', '더 보기')}</Button>}
    </section>
    <section>
      <h3 className="mb-3 text-sm font-medium text-neutral-primary">{t('career.automation.follows', '팔로우하는 회사')}</h3>
      {!follows.length && <p className="text-sm text-neutral-muted">{t('career.automation.no_follows', '팔로우하는 회사가 없습니다.')}</p>}
      <div className="divide-y divide-neutral-300">
        {follows.map(item => <div key={item.id} className="flex items-start justify-between gap-3 py-4">
          <div><p className="text-sm text-neutral-primary">{item.workspace?.company_name ?? item.company?.name}</p>
            <p className="mt-1 text-xs text-neutral-muted">{item.scope === 'workspace' ? t('career.automation.workspace', '이 조직의 공고') : t('career.automation.company', '회사의 모든 연결 조직 공고')}</p>
            {item.instruction && <p className="mt-2 text-sm text-neutral-muted">{item.instruction}</p>}
          </div>
          <Button size="sm" disabled={busy === item.id} onClick={() => void mutate('follow', item.id, item.revision, 'unfollow')}>{t('career.automation.unfollow', '팔로우 취소')}</Button>
        </div>)}
      </div>
      {followOffset !== null && <Button size="sm" disabled={busy === 'follow'} onClick={() => void loadMore('follow')}>{t('career.automation.more', '더 보기')}</Button>}
    </section>
  </div>;
}
