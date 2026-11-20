import "server-only";
import type { CareerOpportunityFeedbackFollowUpTrigger } from "@/lib/career/prompts/types";
import * as lifecycle from '@/lib/career/prompts/cases/lifecyclePrompts';
import * as kickoff from '@/lib/career/prompts/cases/kickoffPrompts';
import * as defer from '@/lib/career/prompts/cases/onboardingDeferPrompts';
import * as insight from '@/lib/career/prompts/cases/insightExtractionPrompts';
import * as profile from '@/lib/career/prompts/cases/profileIngestionPrompts';
import * as mock from '@/lib/career/prompts/cases/mockInterviewPrompts';
import * as voice from '@/lib/career/voiceSessionInstructions';
import * as ext from '@/lib/externalRecommendationsV2/prompts';

// Pure builders are invoked with explicitly synthetic inputs; never call an LLM.
export function renderAuxiliaryPrompts() {
 const prompts: Record<string, {text: string; source: string; kind: string}> = {};
 const add = (id: string, _title: string, text: string, source: string, kind = "현재 조립 결과 · 개인 정보는 자리표시자") => { prompts["p:" + id] = {text, source, kind}; };
const life='src/lib/career/prompts/cases/lifecyclePrompts.ts';
const placeholders={preferredLocale:'ko',transcript:[{role:'user' as const,text:'[이 통화에서 사용자가 실제로 한 말]'}],durationLabel:'[실제 통화 길이]',callNoteCreated:true,isOnboardingDone:true};
add('return','다시 방문했을 때 알려주는 내용',lifecycle.buildCareerSessionStartTurnInstruction({currentAccessAt:'2026-11-12T00:00:00Z',idleMs:86400000,isOnboardingDone:true,previousChatAt:'2026-11-11T00:00:00Z',preferredLocale:'ko',recentReengagementHistory:['[최근 재방문 안내 원문]'],timeZone:'Asia/Seoul'}),life);
add('return_onboarding','온보딩 중 다시 방문했을 때',lifecycle.buildCareerSessionStartTurnInstruction({currentAccessAt:'2026-11-12T00:00:00Z',idleMs:86400000,isOnboardingDone:false,previousChatAt:'2026-11-11T00:00:00Z',preferredLocale:'ko',timeZone:'Asia/Seoul'}),life);
for(const [id,trigger] of Object.entries({feedback_internal:'immediate_internal_feedback',feedback_external:'delayed_external_feedback',feedback_empty:'all_recommended_opportunities_cleared'}))add(id,'기회 버튼을 누른 뒤의 지침',lifecycle.buildCareerOpportunityFeedbackFollowUpTurnInstruction({preferredLocale:'ko',trigger:trigger as CareerOpportunityFeedbackFollowUpTrigger}),life);
add('wrapup','통화 후 채팅 답변 지침',lifecycle.buildCareerCallWrapupTurnInstruction(placeholders),life);
add('kickoff','첫 인사 작성 지침',kickoff.buildCareerKickoffSystemPrompt({preferredLocale:'ko'}),'src/lib/career/prompts/cases/kickoffPrompts.ts');
add('defer','온보딩을 나중에 할 때의 답변',defer.buildCareerOnboardingDeferCloseSystemPrompt({preferredLocale:'ko'}),'src/lib/career/prompts/cases/onboardingDeferPrompts.ts');
add('extract','온보딩 대화에서 저장할 사실 찾기',insight.buildCareerInsightExtractionPrompt({preferredLocale:'ko'}),'src/lib/career/prompts/cases/insightExtractionPrompts.ts');
add('extract_voice','온보딩 통화에서 저장할 사실 찾기',insight.buildCareerInsightExtractionOnlyPrompt({preferredLocale:'ko'}),'src/lib/career/prompts/cases/insightExtractionPrompts.ts');
add('profile_ingest','이력서를 프로필로 정리하기',profile.buildCareerProfileIngestionSystemPrompt(),'src/lib/career/prompts/cases/profileIngestionPrompts.ts');
add('profile_merge','새 자료와 기존 프로필 합치기',profile.buildCareerProfileUpdateMergeSystemPrompt(),'src/lib/career/prompts/cases/profileIngestionPrompts.ts');
add('mock','모의면접 진행 지침',mock.MOCK_INTERVIEW_POLICY,'src/lib/career/prompts/cases/mockInterviewPrompts.ts');
add('voice_front','듣고 말하는 음성 모델의 지침',voice.buildLiveFrontendInstructions({initialResponseInstruction:'[이번 통화의 시작 목적]',responseLocale:'ko'}),'src/lib/career/voiceSessionInstructions.ts');
add('voice_front_onboarding','온보딩 음성 모델의 지침',voice.buildLiveFrontendInstructions({initialResponseInstruction:'[첫 통화]',responseLocale:'ko',onboardingContext:'onboarding'}),'src/lib/career/voiceSessionInstructions.ts');
add('external_plan','외부 공고 검색 계획',ext.PLAN_PROMPT,'src/lib/externalRecommendationsV2/prompts.ts');
add('worker_plan','정기 외부 공고 검색 계획',ext.WORKER_PLAN_PROMPT,'src/lib/externalRecommendationsV2/prompts.ts');
add('external_summary','공고 설명 작성',ext.summaryPrompt('ko'),'src/lib/externalRecommendationsV2/prompts.ts');
add('external_rank','평가한 공고 중 최종 선택',ext.rerankPrompt('ko'),'src/lib/externalRecommendationsV2/prompts.ts');

 return prompts;
}
