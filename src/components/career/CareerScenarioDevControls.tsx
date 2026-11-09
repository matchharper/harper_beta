// career-i18n-skip-file: Internal evaluation controls.
import { useQuery } from '@tanstack/react-query';
import { useCareerApi } from '@/hooks/career/useCareerApi';
import CareerCheckpointDevControls from './CareerCheckpointDevControls';

export default function CareerScenarioDevControls() {
  const { fetchWithAuth } = useCareerApi();
  const registry = useQuery({
    queryKey: ['career-dev-scenarios'],
    queryFn: async () => {
      const response = await fetchWithAuth('/api/talent/dev-application-checkpoint?scenarios=1');
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || result.error || '시나리오를 읽지 못했습니다.');
      return result as { scenarios: { id: string; title: string }[]; checkpoint: string };
    },
    retry: false,
  });
  if (registry.error) return <p>{registry.error.message}</p>;
  return <>{registry.data?.scenarios.map(scenario => (
    <CareerCheckpointDevControls key={scenario.id}
      endpoint={`/api/talent/dev-application-checkpoint?scenario=${encodeURIComponent(scenario.id)}`}
      label={scenario.title} checkpoint={registry.data!.checkpoint}
      restoreLabel={`${scenario.title} · 초기화`}
      showComparison={false}
      description="프로필·대화·문서를 고정된 빈약한 프로필 상태로 되돌리고 이 시나리오의 기회를 준비합니다. 이후 지원하기를 눌러 테스트할 수 있습니다."
    />
  ))}</>;
}
