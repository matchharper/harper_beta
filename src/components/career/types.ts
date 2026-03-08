export type CareerStage = "profile" | "chat" | "completed";
export type MessageRole = "assistant" | "user";
export type CareerInputMode = "text" | "voice";

export type CareerMessage = {
  id: string | number;
  role: MessageRole;
  content: string;
  messageType: string;
  createdAt: string;
  typing?: boolean;
};

export type SessionResponse = {
  conversation: {
    id: string;
    stage: CareerStage;
    title: string | null;
    resumeFileName: string | null;
    resumeStoragePath?: string | null;
    resumeDownloadUrl?: string | null;
    resumeLinks: string[];
    reliefNudgeSent: boolean;
  };
  messages: Array<{
    id: number;
    role: MessageRole;
    content: string;
    messageType: string;
    createdAt: string;
  }>;
};
