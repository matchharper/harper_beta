import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MessagesProvider } from '@/i18n/useMessage';
import { supabase } from '@/lib/supabase';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import type { BrowserSessionViewData } from './BrowserSessionCard';

test('active browsers mount automatically; docking, folding, mobile and selection keep their viewers alive', async () => {
  const dom = new JSDOM('<header class="career-topbar"></header><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  dom.window.document.querySelector('header')!.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 390, 60);
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, DOMRect: dom.window.DOMRect, HTMLElement: dom.window.HTMLElement, HTMLInputElement: dom.window.HTMLInputElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, CustomEvent: dom.window.CustomEvent, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  // Import after the DOM is ready so Radix enables its browser layout effects.
  const { BrowserSessionDockView, BrowserSessionProvider, BrowserSessionAnchor, BrowserSessionDock } = await import('./BrowserSessionDock');
  const views: BrowserSessionViewData[] = ['first','second'].map(id=>({ session:{id,status:'running',revision:1}, liveUrl:`https://example.com/${id}`, browserAvailability:'active', executions:[] }));
  const root = createRoot(dom.window.document.getElementById('root')!);
  let selected: string | null = null;
  let visible = views;
  const viewport = dom.window.document.createElement('div');
  viewport.setAttribute('data-career-timeline', '');
  const slot = dom.window.document.createElement('div');
  viewport.appendChild(slot);
  dom.window.document.body.appendChild(viewport);
  let slotTop = 100;
  viewport.getBoundingClientRect = () => new dom.window.DOMRect(0, 50, 800, 500);
  slot.getBoundingClientRect = () => new dom.window.DOMRect(20, slotTop, 320, 250);
  const anchors = new Map([['first', slot]]);
  const render = () => root.render(<MessagesProvider locale="ko"><div data-career-chat-layout style={{position:'relative'}}><BrowserSessionDockView views={visible} anchors={anchors} selectedId={selected} onSelect={id=>{selected=id;render();}} /></div></MessagesProvider>);
  try {
    await act(async () => render());
    dom.window.document.querySelector<HTMLElement>('[data-career-chat-layout]')!.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 800, 800);
    assert.equal(dom.window.document.querySelectorAll('iframe').length, 2);
    assert.ok([...dom.window.document.querySelectorAll('iframe')].every(frame => frame.closest('[hidden]')),
      'new browsers start folded on desktop without covering the conversation');
    await act(async () => { selected = 'first'; render(); });
    const first = dom.window.document.querySelector('[data-browser-session-id="first"] iframe');
    assert.ok(first);
    assert.equal(dom.window.document.querySelectorAll('iframe').length, 2);
    const placement = () => first.closest('[data-browser-placement]')!.getAttribute('data-browser-placement');
    const scroll = async (top: number) => {
      slotTop = top;
      await act(async () => {
        viewport.dispatchEvent(new dom.window.Event('scroll'));
        await new Promise(resolve => setTimeout(resolve, 40));
      });
    };
    assert.equal(placement(), 'inline');
    assert.equal(slot.contains(first), false, 'the portal has a stable owner independent of the scroll slot');
    const panel = first.closest('[data-browser-placement]') as HTMLElement;
    assert.equal(panel.style.position, 'fixed');
    const wheel = new dom.window.WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true });
    panel.dispatchEvent(wheel);
    assert.equal(wheel.defaultPrevented, false, 'inline scrolling stays native');
    await scroll(-199); // One pixel of the slot remains in the timeline.
    assert.equal(placement(), 'inline');
    await scroll(-200);
    assert.equal(placement(), 'dock');
    assert.equal(slot.contains(first), false, 'docking does not move or reconnect the iframe');
    assert.equal(panel.style.position, 'fixed');
    assert.equal(panel.style.width, '320px', 'desktop docking starts as a small preview');
    assert.equal(panel.style.zIndex, '11', 'docked viewer stays below the composer layer');
    assert.equal(panel.style.transition, '');
    // Explicit selection survives resizing; unselected docks remain folded.
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 390 });
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event('resize')); });
    const browser = first.closest('[data-browser-session-id]')!;
    assert.equal(browser.getAttribute('data-browser-expanded'), 'true');
    await act(async () => { selected = null; render(); });
    assert.equal(browser.getAttribute('data-browser-expanded'), 'false');
    assert.ok(first.closest('[hidden]'));
    assert.equal(panel.style.top, '68px', 'mobile browsers stay below the main navigation');
    const toggle = () => panel.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    await act(async () => toggle().click());
    assert.equal(browser.getAttribute('data-browser-expanded'), 'true');
    assert.equal(panel.style.width, '320px', 'mobile expansion keeps the folded width');
    assert.equal(panel.style.top, '68px', 'mobile expansion grows downward below navigation');
    assert.equal(first.closest('[hidden]'), null);
    await act(async () => toggle().click());
    assert.equal(browser.getAttribute('data-browser-expanded'), 'false');
    assert.equal(panel.querySelector('iframe'), first);
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 1024 });
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event('resize')); });

    await scroll(100);
    assert.equal(placement(), 'inline');
    assert.equal(dom.window.document.querySelector('[data-browser-session-id="first"] iframe'), first);
    assert.ok(first.closest('[hidden]'), 'explicit fold preference survives returning to the conversation');
    await scroll(550); // Below the visible timeline also docks.
    assert.equal(placement(), 'dock');
    await scroll(549);
    assert.equal(placement(), 'inline');
    await scroll(100);
    await act(async () => {
      dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
        origin: 'https://live.browser-use.com',
        source: (first as HTMLIFrameElement).contentWindow!,
        data: { type: 'browser-use:viewport', width: 1280, height: 720 },
      }));
    });
    assert.equal(first.parentElement?.getAttribute('aria-busy'), 'false');
    assert.equal(first.parentElement?.querySelector('[role="status"]'), null, 'loading indicator disappears after the viewer reports its viewport');
    await act(async () => { selected = 'second'; render(); });
    const second = dom.window.document.querySelector('[data-browser-session-id="second"] iframe');
    assert.ok(second);
    assert.equal(dom.window.document.querySelectorAll('iframe').length, 2);
    assert.equal(second.parentElement?.getAttribute('aria-busy'), 'true', 'another viewer connects independently');
    assert.equal(dom.window.document.querySelector('[data-browser-session-id="second"]')?.getAttribute('data-browser-expanded'), 'true');
    assert.equal(dom.window.document.querySelector('[data-browser-session-id="first"] iframe'), first);
    assert.ok(first.closest('[hidden]'), 'selecting another session folds the previous viewer');
    // Newly arriving sessions must not steal the chosen browser.
    await act(async () => { visible = [...views, {...views[0], session: {...views[0].session, id: 'third'}}]; render(); });
    assert.equal(dom.window.document.querySelector('[data-browser-session-id="second"] iframe'), second);
    assert.equal(dom.window.document.querySelector('[data-browser-session-id="second"]')?.getAttribute('data-browser-expanded'), 'true');
    assert.ok(dom.window.document.querySelector('[data-browser-session-id="third"] iframe')?.closest('[hidden]'),
      'new arrivals cannot expand beside the selected viewer');
    await act(async () => { selected = 'first'; render(); });
    assert.equal(dom.window.document.querySelectorAll('iframe').length, 3);
    assert.equal(dom.window.document.querySelector('iframe')?.classList.contains('pointer-events-none'), true, 'selecting is not a browser-control handoff');
    // A provider asking for login must not take over the user's conversation.
    await act(async () => { selected = null; visible = [{...views[0], session: {...views[0].session, status: 'human', revision: 2}}]; render(); });
    assert.notEqual(placement(), 'fullscreen');
    assert.ok(first.closest('[hidden]'));
    // Explicitly opening the human-control browser fills the viewport.
    await act(async () => { selected = 'first'; render(); });
    assert.equal(placement(), 'fullscreen');
    assert.equal(panel.style.width, '992px');
    assert.equal(panel.style.height, `${dom.window.innerHeight - 32}px`);
    assert.equal(first.closest('[hidden]'), null);
    assert.equal((first as HTMLIFrameElement).style.width, '100%');
    assert.equal(panel.querySelector('iframe'), first);
    Object.defineProperty(dom.window, 'innerWidth', { configurable: true, value: 390 });
    const visualViewport = new dom.window.EventTarget();
    Object.assign(visualViewport, { width: 390, height: 400, offsetLeft: 0, offsetTop: 120 });
    Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: visualViewport });
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event('resize')); });
    assert.equal(panel.style.width, '374px');
    assert.equal(panel.style.height, '384px', 'manual controls fit above the software keyboard');
    assert.equal(panel.style.top, '128px');
    await act(async () => toggle().click());
    assert.equal(placement(), 'dock');
    assert.ok(first.closest('[hidden]'));
    await act(async () => toggle().click());
    assert.equal(placement(), 'fullscreen');
    assert.equal(panel.querySelector('iframe'), first);
    await act(async () => { visible = [{...views[0], session: {...views[0].session, status: 'idle', revision: 3}}]; render(); });
    assert.equal(placement(), 'dock');
    assert.equal(panel.style.width, '320px');
    assert.equal(panel.style.height, '');
    assert.equal(first.closest('[hidden]'), null, 'Done preserves the explicitly selected viewer without full-screen control');
    assert.equal(panel.querySelector('iframe'), first);
    await act(async () => { selected = null; visible = [views[1]]; render(); });
    assert.equal(dom.window.document.querySelectorAll('iframe').length, 1);

    // Reproduce a generated artifact followed by references to the same session.
    const client = new QueryClient();
    client.setQueryData(['career-browser-dock', 'fixture'], {
      sessions: [{ id: 'first', status: 'running', revision: 1,
        liveUrl: 'https://example.com/first', browserAvailability: 'active' }],
    });
    let references = ['artifact'];
    const renderReferences = () => root.render(
      <QueryClientProvider client={client}>
        <RouterContext.Provider value={{ query: {} } as any}>
          <MessagesProvider locale="ko">
            <BrowserSessionProvider conversationId="fixture" enabled={false} messages={[]}>
              <div data-career-chat-layout><div data-career-timeline>
                {references.map(id => <section key={id} data-reference={id}>
                  <BrowserSessionAnchor sessionId="first" source={id === 'artifact' ? 'artifact' : 'reference'} />
                </section>)}
              </div><BrowserSessionDock /></div>
            </BrowserSessionProvider>
          </MessagesProvider>
        </RouterContext.Provider>
      </QueryClientProvider>
    );
    const location = () => dom.window.document.querySelector('[data-browser-inline-anchor]')?.closest('section')?.dataset.reference;
    const reference = (id: string) => dom.window.document.querySelector<HTMLElement>(`[data-reference="${id}"] > div`)!;
    await act(async () => renderReferences());
    const retainedFrame = dom.window.document.querySelector('iframe');
    assert.ok(retainedFrame);
    assert.equal(location(), 'artifact');
    reference('artifact').style.height = '320px';
    await act(async () => { references = ['artifact', 'answer']; renderReferences(); });
    assert.equal(location(), 'answer');
    assert.equal(reference('artifact').hidden, true);
    assert.equal(reference('artifact').style.height, '');
    reference('answer').style.height = '320px';
    await act(async () => { references = ['artifact', 'answer', 'latest']; renderReferences(); });
    assert.equal(location(), 'latest');
    assert.equal(reference('answer').style.height, '');
    assert.ok(reference('answer').querySelector('[data-browser-trigger]'));
    assert.equal(dom.window.document.querySelectorAll('[data-browser-inline-anchor]').length, 1);
    assert.equal(dom.window.document.querySelector('iframe'), retainedFrame);
    await act(async () => { references = ['history', ...references]; renderReferences(); });
    assert.equal(location(), 'latest', 'prepending history must not steal the viewer');
    await act(async () => { references = ['history', 'artifact', 'answer']; renderReferences(); });
    assert.equal(location(), 'answer', 'deleting the latest reference restores the preceding one');
    await act(async () => { references = ['artifact']; renderReferences(); });
    assert.equal(location(), 'artifact');
    assert.equal(reference('artifact').hidden, false);
    assert.equal(dom.window.document.querySelector('iframe'), retainedFrame);
    await act(async () => {
      client.setQueryData(['career-browser-dock', 'fixture'], {
        sessions: [],
        summaries: [{ id: 'first', status: 'idle', revision: 2,
          title: 'Example · Engineer', browserAvailability: 'stopped' }],
      });
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    assert.equal(dom.window.document.querySelector('iframe'), null);
    const stoppedLink = reference('artifact').querySelector<HTMLButtonElement>('button')!;
    assert.ok(stoppedLink.textContent?.includes('Example · Engineer'));
    assert.ok(stoppedLink.textContent?.includes('종료된 브라우저'));
    assert.equal(stoppedLink.disabled, true, 'a stopped browser never offers a dead open action');
    client.clear();
  } finally {
    await act(async () => root.unmount());
    // Radix restores focus on the next timer turn after unmounting its scope.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await supabase.auth.stopAutoRefresh(); dom.window.close();
    for (const [key,value] of previous) { if(value) Object.defineProperty(globalThis,key,value); else Reflect.deleteProperty(globalThis,key); }
  }
});
