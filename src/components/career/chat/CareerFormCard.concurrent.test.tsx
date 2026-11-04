import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { NextRouter } from 'next/router';
import { MessagesProvider } from '@/i18n/useMessage';
import { CareerChatPanelProvider, type CareerChatPanelContextValue } from '../CareerChatPanelContext';
import { CareerFormCard } from './CareerFormCard';
import { supabase } from '@/lib/supabase';
import type { CareerForm } from '@/lib/career/forms/schema';

test('two forms remain editable during a chat turn and save independently while another response is pending', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/career' });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.mock.method(supabase.auth, 'getSession', async () => ({ data: { session: { access_token: 'fixture' } }, error: null }));
  const posts: Record<string, any>[] = [];
  let finishFirst!: () => void;
  const forms: CareerForm[] = [10, 20].map(formId => ({ formId, revision: 1, kind: 'form', title: `폼 ${formId}`, items: [{ id: 'company', label: '회사', type: 'text', content: { value: `회사 ${formId}` } }], positive: { id: 'save', label: `저장 ${formId}`, message: '수정 내용을 반영해줘.' } }));
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url.includes('/browser?')) return Response.json({ sessions: [] });
    if (url.includes('/api/talent/work')) return Response.json({ forms, pending: 1 });
    if (init?.method !== 'POST') return Response.json({ responses: [] });
    assert.equal(url, '/api/talent/forms');
    const input = JSON.parse(String(init.body)); posts.push(input);
    if (input.formId === 10) await new Promise<void>(resolve => { finishFirst = resolve; });
    return Response.json({ message: { id: input.formId + 100, content: '수정 내용을 반영해줘.', formResponse: { ...input, formSnapshot: forms.find(form => form.formId === input.formId) } } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(dom.window.document.getElementById('root')!);
  const chatSubmissions: Parameters<CareerChatPanelContextValue['onSendChatMessage']>[0][] = [];
  const context = { conversationId: 'conversation', user: { id: 'user' }, messages: [], stage: 'chat', chatPending: true, assistantTyping: true, opportunityFeedbackFollowUpPending: true, onSendChatMessage: (args: Parameters<CareerChatPanelContextValue['onSendChatMessage']>[0]) => {
    chatSubmissions.push(args);
    if (context.chatPending) args.onError?.();
    else args.onSuccess?.();
  } } as unknown as CareerChatPanelContextValue;
  try {
    const render = (visible: CareerForm[]) => act(async () => { root.render(<QueryClientProvider client={client}><RouterContext.Provider value={{ locale: 'ko', query: {} } as NextRouter}><MessagesProvider locale="ko"><CareerChatPanelProvider value={context}>{visible.map((form, index) => <CareerFormCard key={index} form={form} />)}</CareerChatPanelProvider></MessagesProvider></RouterContext.Provider></QueryClientProvider>); });
    await render(forms);
    const inputs = [...dom.window.document.querySelectorAll('input')];
    assert.equal(inputs.length, 2);
    assert.ok(inputs.every(input => !input.disabled));
    const edit = (input: HTMLInputElement, value: string) => {
      const props = Object.keys(input).find(key => key.startsWith('__reactProps$'))!;
      (input as any)[props].onChange({ target: { value } });
    };
    await act(async () => { edit(inputs[0], '첫 수정'); edit(inputs[1], '두 번째 수정'); });
    const buttons = [...dom.window.document.querySelectorAll('button')];
    await act(async () => buttons.find(button => button.textContent === '저장 10')!.click());
    assert.equal(posts.length, 1);
    assert.equal(inputs[1].disabled, false);
    await act(async () => buttons.find(button => button.textContent === '저장 20')!.click());
    assert.equal(posts.length, 2);
    assert.deepEqual(posts.map(post => post.values), [{ company: '첫 수정' }, { company: '두 번째 수정' }]);
    assert.notEqual(posts[0].requestId, posts[1].requestId);
    assert.equal(chatSubmissions.length, 0, 'the durable form endpoint owns continuation without a second chat request');
    assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
    await act(async () => finishFirst());
    context.chatPending = false;
    await act(async () => buttons.find(button => button.textContent === '저장 20')!.click());
    assert.equal(posts[2].requestId, posts[1].requestId, 'unchanged repeated clicks preserve response idempotency');
    assert.equal(chatSubmissions.length, 0);
    assert.equal(inputs[0].value, '첫 수정');
    assert.equal(inputs[1].value, '두 번째 수정');
    assert.equal(dom.window.document.querySelectorAll('[role="alert"]').length, 0);
    await render([forms[0], forms[0]]);
    const repeated = [...dom.window.document.querySelectorAll('input')];
    assert.notEqual(repeated[0].id, repeated[1].id, 'timeline and composer instances have independent accessible labels');
    for (const label of dom.window.document.querySelectorAll('label')) assert.equal(label.parentElement?.querySelector('input')?.id, label.htmlFor);
    await act(async () => edit(repeated[1], '어느 화면에서도 같은 최신 수정'));
    assert.equal(repeated[0].value, repeated[1].value, 'editing the composer immediately updates the timeline draft');
    await render([]);
    await render([forms[0], forms[0]]);
    const reopened = [...dom.window.document.querySelectorAll('input')];
    assert.ok(reopened.every(input => input.value === '어느 화면에서도 같은 최신 수정'), 'both surfaces restore the same draft after closing');
    await act(async () => [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === '저장 10')!.click());
    assert.deepEqual(posts.at(-1)?.values, { company: '어느 화면에서도 같은 최신 수정' }, 'submitting the other surface uses the edited draft');
    await act(async () => finishFirst());
  } finally {
    await act(async () => root.unmount()); client.clear(); dom.window.close();
    for (const [key, value] of previous) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
  }
});
