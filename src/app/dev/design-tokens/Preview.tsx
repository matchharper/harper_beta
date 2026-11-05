"use client";

import { useEffect, useState } from "react";
import { ArrowUp, MoreHorizontal, Settings } from "lucide-react";
import { MessagesProvider } from "@/i18n/useMessage";
import { MuteButton, CardButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, TextField } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Typography } from "@/components/ui/typography";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Radio } from "@/components/ui/radio";
import { Switch } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Tooltips } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { ChatComposerFrame } from "@/components/chat/ChatComposer";
import { CHAT_USER_BUBBLE_CLASS } from "@/components/chat/ChatTimeline";
import { useToastStore } from "@/store/useToastStore";

const editableTokens = [
  "--color-bg-basement",
  "--color-surface",
  "--color-surface-border",
  "--color-neutral-primary",
  "--surface-border-width",
  "--radius-surface",
  "--radius-control",
  "--shadow-surface",
  "--blur-surface",
  "--color-modal",
  "--radius-modal",
  "--color-menu",
  "--color-overlay",
  "--blur-overlay",
  "--color-card-foreground",
  "--color-control-foreground",
  "--color-button-foreground",
  "--color-modal-foreground",
  "--color-menu-foreground",
  "--color-composer-foreground",
  "--background-image-surface-image",
  "--color-composer",
  "--radius-composer",
  "--font-weight-heading",
  "--font-weight-body",
];

function RoleSelect({ id }: { id: string }) {
  return (
    <Select
      defaultValue="engineer"
      items={{ engineer: "Product Engineer", designer: "Product Designer" }}
    >
      <SelectTrigger aria-label={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="engineer">Product Engineer</SelectItem>
        <SelectItem value="designer">Product Designer</SelectItem>
      </SelectContent>
    </Select>
  );
}

export default function Preview() {
  const [preset, setPreset] = useState("current");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [modal, setModal] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState("opportunity");
  const addToast = useToastStore((state) => state.add);

  useEffect(() => {
    const root = document.documentElement;
    const previousPreset = root.getAttribute("data-design-preview");
    root.setAttribute("data-design-preview", preset);
    const previous = Object.keys(overrides).map((key) => [
      key,
      root.style.getPropertyValue(key),
      root.style.getPropertyPriority(key),
    ]);
    for (const [key, value] of Object.entries(overrides))
      if (value.trim()) root.style.setProperty(key, value);
    return () => {
      if (previousPreset === null) root.removeAttribute("data-design-preview");
      else root.setAttribute("data-design-preview", previousPreset);
      for (const [key, value, priority] of previous) {
        if (value) root.style.setProperty(key, value, priority);
        else root.style.removeProperty(key);
      }
    };
  }, [preset, overrides]);

  return (
    <MessagesProvider locale="ko" persistPreference={false}>
      <main className="min-h-dvh bg-bg-basement bg-workspace-image p-5 text-neutral-primary md:p-10">
        <header className="mx-auto mb-8 flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <Typography as="h1" variant="page-title">
              디자인 변수 검증
            </Typography>
            <Typography variant="caption">
              로컬 UI · 실제 공용 컴포넌트 · 외부 저장 없음
            </Typography>
          </div>
          <div className="flex gap-2">
            {[
              ["current", "기본값"],
              ["flat", "평면"],
              ["glass", "글래스"],
            ].map(([id, label]) => (
              <MuteButton
                key={id}
                aria-pressed={preset === id}
                variant={preset === id ? "dark" : "default"}
                onClick={() => {
                  setOverrides({});
                  setPreset(id);
                }}
              >
                {label}
              </MuteButton>
            ))}
          </div>
        </header>
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-3">
          <Card data-testid="card">
            <CardHeader>
              <CardTitle>내 기회</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Tabs
                variant="pills"
                items={[
                  { value: "opportunity", label: "새 기회" },
                  { value: "saved", label: "저장함" },
                ]}
                activeValue={selected}
                onValueChange={setSelected}
              />
              <CardButton data-testid="card-button">
                <div>
                  <Typography variant="title">Product Engineer</Typography>
                  <Typography variant="description">
                    Harper · 서울 · 하이브리드
                  </Typography>
                </div>
              </CardButton>
              <div className="flex flex-wrap gap-2">
                <Badge tone="positive">연결됨</Badge>
                <Badge tone="warning">확인 대기</Badge>
                <Badge variant="count">3</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <MuteButton variant="dark">자세히 보기</MuteButton>
                <MuteButton>저장</MuteButton>
                <MuteButton disabled>비활성</MuteButton>
                <MuteButton variant="transparent" aria-label="설정">
                  <Settings size={16} />
                </MuteButton>
              </div>
              <div className="flex gap-2">
                <MuteButton variant="primary">Primary</MuteButton>
                <MuteButton variant="positive">완료</MuteButton>
                <MuteButton variant="critical">삭제</MuteButton>
              </div>
              <Typography variant="description">
                표면·글자·테두리·모서리·그림자를 한 번에 변경해 확인합니다.
              </Typography>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>입력과 선택</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="grid gap-1.5 text-sm">
                이름
                <Input aria-label="이름" placeholder="이름을 입력하세요" />
              </label>
              <Input
                aria-label="비활성 입력"
                disabled
                placeholder="변경할 수 없는 항목"
              />
              <RoleSelect id="역할" />
              <TextField
                id="preview-text-field"
                aria-label="추가 입력"
                label="추가 입력"
                placeholder="TextField"
              />
              <Textarea aria-label="소개" placeholder="간단한 소개" rows={3} />
              <div className="flex flex-wrap items-center gap-4">
                <Checkbox label="공개" defaultChecked />
                <Radio label="선택" defaultChecked name="preview-radio" />
                <Switch aria-label="알림" defaultChecked />
              </div>
              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <MuteButton>
                      드롭다운
                      <MoreHorizontal size={16} />
                    </MuteButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent data-testid="menu">
                    <DropdownMenuItem>저장</DropdownMenuItem>
                    <DropdownMenuItem selected>선택한 항목</DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>추가 작업</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem>링크 복사</DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem disabled>사용 불가</DropdownMenuItem>
                    <DropdownMenuItem tone="danger">삭제</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Popover>
                  <PopoverTrigger asChild>
                    <MuteButton>팝오버</MuteButton>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-4">
                    <Typography variant="title">팝오버</Typography>
                    <Input aria-label="팝오버 입력" placeholder="키보드 입력" />
                  </PopoverContent>
                </Popover>
                <Tooltips text="변수를 공유하는 툴팁" variant="light">
                  <MuteButton>툴팁</MuteButton>
                </Tooltips>
              </div>
            </CardContent>
          </Card>
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Harper 대화</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-5">
              <div className="rounded-message bg-message-assistant p-4 text-message-assistant-foreground">
                지금 관심 있는 역할을 함께 살펴볼까요?
              </div>
              <div className={CHAT_USER_BUBBLE_CLASS}>
                제품 개발에 참여하고 싶어요.
              </div>
              <form
                className="mt-auto"
                onSubmit={(event) => {
                  event.preventDefault();
                  setMessage("");
                  addToast({ message: "로컬 미리보기", duration: 4000 });
                }}
              >
                <ChatComposerFrame
                  aria-label="Harper에게 메시지"
                  placeholder="Harper에게 메시지"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  action={
                    <MuteButton
                      type="submit"
                      aria-label="보내기"
                      variant="dark"
                      onPointerDown={(event) => event.preventDefault()}
                    >
                      <ArrowUp size={16} />
                    </MuteButton>
                  }
                />
              </form>
              <div className="flex flex-wrap gap-2">
                <MuteButton onClick={() => setModal(true)}>
                  Career 모달
                </MuteButton>
                <Dialog>
                  <DialogTrigger asChild>
                    <MuteButton>공용 모달</MuteButton>
                  </DialogTrigger>
                  <DialogContent data-testid="dialog">
                    <DialogTitle>공용 모달</DialogTitle>
                    <DialogDescription>
                      포털의 배경·테두리·그림자도 같은 변수를 사용합니다.
                    </DialogDescription>
                    <Input aria-label="공용 모달 입력" placeholder="내용" />
                  </DialogContent>
                </Dialog>
                <MuteButton
                  onClick={() =>
                    addToast({
                      message: "변경 내용을 확인했어요.",
                      duration: 5000,
                    })
                  }
                >
                  토스트
                </MuteButton>
              </div>
            </CardContent>
          </Card>
        </div>
        <details className="mx-auto mt-8 max-w-7xl">
          <summary className="cursor-pointer text-sm">변수 직접 조정</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {editableTokens.map((token) => (
              <label key={token} className="grid gap-1 text-xs">
                {token}
                <Input
                  aria-label={token}
                  value={overrides[token] ?? ""}
                  placeholder="CSS 값 (비우면 기본값)"
                  onChange={(event) =>
                    setOverrides((current) => ({
                      ...current,
                      [token]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </details>
        <TalentCareerModal
          open={modal}
          onClose={() => setModal(false)}
          title="지원 정보"
          description="모바일에서는 바텀시트로 표시됩니다."
          mobileBottomSheet
          footer={
            <MuteButton variant="dark" onClick={() => setModal(false)}>
              닫기
            </MuteButton>
          }
        >
          <div className="space-y-4 px-5 pb-4">
            <Input aria-label="모달 이름" placeholder="이름" />
            <RoleSelect id="모달 역할" />
            <Textarea aria-label="모달 소개" placeholder="소개" />
          </div>
        </TalentCareerModal>
      </main>
    </MessagesProvider>
  );
}
